const { Order, OrderItem, Cart, CartItem, Product, ProductImage, User, Wholesaler, Coupon, Shipment } = require('../models');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { createBorzoDeliveryOrder, cancelBorzoOrder, calculateBorzoOrder } = require('../utils/borzoService');

const normalizeStoredImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const normalized = imageUrl.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  return `/uploads/${baseName}`;
};

const normalizeOrderImages = (plainOrder) => {
  if (!plainOrder || !Array.isArray(plainOrder.items)) return plainOrder;
  plainOrder.items = plainOrder.items.map((it) => {
    if (!it || !it.product) return it;
    const product = it.product;
    if (Array.isArray(product.images)) {
      product.images = product.images.map((img) => ({
        ...img,
        image_url: normalizeStoredImageUrl(img.image_url),
      }));
    }
    return it;
  });
  return plainOrder;
};

const parseNonNegativeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
};

const getShippingMargin = () => {
  const percent = parseNonNegativeNumber(process.env.BORZO_SHIPPING_MARGIN_PERCENT);
  const flat = parseNonNegativeNumber(process.env.BORZO_SHIPPING_MARGIN_FLAT);
  return { percent, flat };
};

const calculateShippingFee = async ({ shippingAddress, customer, userType, orderId, dropoffPhone }) => {
  const phone = dropoffPhone || customer?.phone || null;
  const dropoffName =
    userType === 'wholesaler'
      ? customer?.business_name || customer?.name || null
      : customer?.name || null;

  const quote = await calculateBorzoOrder({
    orderId: orderId || null,
    dropoff: {
      address: String(shippingAddress),
      name: dropoffName,
      phone,
    },
    matter: orderId ? `Ashoka order #${orderId}` : 'Ashoka checkout quote',
  });

  const basePrice = parseNonNegativeNumber(quote.price);
  const { percent, flat } = getShippingMargin();
  const marginAmount = basePrice * (percent / 100) + flat;
  const shippingFee = Math.max(0, basePrice + marginAmount);

  return {
    shippingFee: Number(shippingFee.toFixed(2)),
    basePrice: Number(basePrice.toFixed(2)),
    marginAmount: Number(marginAmount.toFixed(2)),
    raw: quote.raw,
  };
};

const createEmailTransport = () => {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '0', 10);
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;

  if (host && port && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
};

const buildPublicOrderId = (order) => {
  if (!order || !order.id) return null;
  const numericId = Number(order.id);
  if (!Number.isFinite(numericId) || numericId <= 0) return String(order.id);
  const padded = String(numericId).padStart(6, '0');

  const hasWholesaler =
    (order.wholesaler_id && Number(order.wholesaler_id) > 0) ||
    (order.wholesaler && (order.wholesaler.id || order.wholesaler.business_name));

  if (hasWholesaler) {
    return `W${padded}`;
  }

  return `U${padded}`;
};

const getInvoiceLogoDataUri = () => {
  try {
    const candidates = [
      path.join(__dirname, '../../../admin-panel/src/assets/logoo.png'),
      path.join(__dirname, '../../../admin-panel/src/assets/logo.png'),
      path.join(__dirname, '../../../Ashoka/src/assets/images/logo.png'),
    ];
    const logoPath = candidates.find((p) => fs.existsSync(p));
    if (!logoPath) return null;
    const buf = fs.readFileSync(logoPath);
    const b64 = buf.toString('base64');
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
};

const getInvoiceLogoBuffer = () => {
  try {
    const candidates = [
      path.join(__dirname, '../../../admin-panel/src/assets/logoo.png'),
      path.join(__dirname, '../../../admin-panel/src/assets/logo.png'),
      path.join(__dirname, '../../../Ashoka/src/assets/images/logo.png'),
    ];
    const logoPath = candidates.find((p) => fs.existsSync(p));
    if (!logoPath) return null;
    return fs.readFileSync(logoPath);
  } catch {
    return null;
  }
};

const INVOICE_BRAND_NAME = 'Olakh Maharashtrachi';

const formatInvoiceMoney = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const escapeInvoiceHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getInvoiceRecipientDetails = (order) => {
  const isCustomer = Boolean(order.customer);
  return {
    titleName: isCustomer
      ? order.customer?.name || 'Customer'
      : order.wholesaler?.business_name || order.wholesaler?.name || 'Wholesaler',
    identity: isCustomer ? 'Customer' : 'Wholesaler',
    email: order.customer?.email || order.wholesaler?.email || '-',
    phone: order.customer?.phone || order.wholesaler?.phone || '-',
  };
};

const formatInvoiceAddressHtml = (value) => {
  const safe = escapeInvoiceHtml(value || '-');
  return safe.replace(/\r?\n/g, '<br />');
};

const getInvoiceItemName = (item) => {
  const baseName = String(item?.product_name || '-');
  const variantName = String(item?.variant_name || '').trim();
  if (!variantName) return baseName;
  return `${baseName}\nVariant: ${variantName}`;
};

const buildInvoiceHtml = ({ order, includePrintScript }) => {
  const { titleName, identity, email, phone } = getInvoiceRecipientDetails(order);
  const shippingFee = Number(order.shipping_fee || 0);
  const subtotal = Number(order.total_amount || 0) + Number(order.discount_amount || 0) - shippingFee;
  const discount = Number(order.discount_amount || 0);
  const total = Number(order.total_amount || 0);
  const dateStr = new Date(order.created_at || Date.now()).toLocaleString();
  const publicId = buildPublicOrderId(order) || order.id;
  const logoDataUri = getInvoiceLogoDataUri();

  const buildImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (typeof imagePath !== 'string') return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
    return normalizedPath;
  };

  const rows = (order.items || [])
    .map((it) => {
      let imageUrl = null;
      if (it.product && Array.isArray(it.product.images) && it.product.images.length > 0) {
        const primaryImage = it.product.images.find((img) => img.is_primary) || it.product.images[0];
        if (primaryImage && primaryImage.image_url) {
          imageUrl = buildImageUrl(primaryImage.image_url);
        }
      }
      const imageMarkup = imageUrl
        ? `<img src="${imageUrl}" alt="${escapeInvoiceHtml(it.product_name)}" style="width:52px;height:52px;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;background:#fff7ed;" />`
        : '';
      const productName = escapeInvoiceHtml(it.product_name || '-');
      const variantName = String(it.variant_name || '').trim();
      const variantMarkup = variantName
        ? `<div class="item-subtitle">Variant: ${escapeInvoiceHtml(variantName)}</div>`
        : '';
      return `
      <tr class="item-row">
        <td class="cell product-cell">
          <div class="product-wrap">
            ${imageMarkup}
            <div>
              <div class="item-title">${productName}</div>
              ${variantMarkup}
            </div>
          </div>
        </td>
        <td class="cell text-center">${Number(it.quantity || 0)}</td>
        <td class="cell text-right">${formatInvoiceMoney(it.price)}</td>
        <td class="cell text-right">${formatInvoiceMoney(Number(it.price || 0) * Number(it.quantity || 0))}</td>
      </tr>
    `;
    })
    .join('');

  const logoMarkup = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo" style="height:58px;max-width:150px;object-fit:contain;display:block;" />`
    : '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${publicId}</title>
    <style>
      @page { margin: 20mm 14mm 18mm 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f6f7fb;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
      }
      .invoice-shell {
        max-width: 940px;
        margin: 24px auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }
      .top-accent {
        height: 8px;
        background: linear-gradient(90deg, #f97316 0%, #fb923c 45%, #fdba74 100%);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        padding: 24px 28px 18px 28px;
        border-bottom: 1px solid #eef2f7;
      }
      .brand-block { display: flex; align-items: flex-start; gap: 16px; flex: 1; min-width: 0; }
      .brand-copy { min-width: 0; flex: 1; }
      .eyebrow {
        color: #ea580c;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .brand {
        margin-top: 6px;
        font-size: 24px;
        font-weight: 800;
        color: #111827;
        line-height: 1.15;
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      .meta-panel {
        min-width: 260px;
        flex: 0 0 260px;
        padding: 16px 18px;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        background: #fffaf5;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 0;
        font-size: 13px;
      }
      .meta-label { color: #6b7280; }
      .meta-value { color: #111827; font-weight: 700; text-align: right; }
      .badge {
        display: inline-block;
        padding: 5px 10px;
        border-radius: 999px;
        background: #fff7ed;
        border: 1px solid #fdba74;
        color: #c2410c;
        font-size: 11px;
        font-weight: 700;
        text-transform: capitalize;
      }
      .content { padding: 22px 28px 28px 28px; }
      .details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-bottom: 18px;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        background: #ffffff;
        padding: 18px;
      }
      .card-title {
        margin: 0 0 14px 0;
        color: #111827;
        font-size: 15px;
        font-weight: 800;
      }
      .line { margin: 6px 0; font-size: 13px; color: #374151; }
      .line strong { color: #111827; }
      .address-block {
        white-space: normal;
        font-size: 13px;
        line-height: 1.7;
        color: #374151;
      }
      .table-card {
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        overflow: hidden;
        background: #ffffff;
      }
      .table-title {
        padding: 16px 18px 12px 18px;
        font-size: 15px;
        font-weight: 800;
        color: #111827;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr, td, th {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      thead th {
        padding: 12px 14px;
        background: #fff7ed;
        border-top: 1px solid #e5e7eb;
        border-bottom: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .item-row { border-bottom: 1px solid #eef2f7; }
      .cell { padding: 14px; font-size: 13px; vertical-align: top; color: #111827; }
      .product-cell { width: 52%; }
      .product-wrap { display: flex; align-items: flex-start; gap: 12px; }
      .item-title { font-weight: 700; line-height: 1.45; }
      .item-subtitle { margin-top: 4px; color: #6b7280; font-size: 12px; }
      .text-center { text-align: center; }
      .text-right { text-align: right; white-space: nowrap; }
      .summary-wrap {
        display: flex;
        justify-content: flex-end;
        margin-top: 18px;
      }
      .summary-card {
        width: 320px;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        background: #fffaf5;
        padding: 16px 18px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
        font-size: 13px;
      }
      .summary-row .label { color: #6b7280; }
      .summary-row .value { color: #111827; font-weight: 700; text-align: right; white-space: nowrap; }
      .summary-row.total {
        margin-top: 6px;
        padding-top: 12px;
        border-top: 1px solid #fdba74;
        font-size: 15px;
      }
      .summary-row.total .label,
      .summary-row.total .value { color: #111827; font-weight: 800; }
      .footer {
        padding: 18px 28px 26px 28px;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
      }
      @media print {
        body { background: #ffffff; }
        .invoice-shell {
          margin: 0;
          border-radius: 0;
          box-shadow: none;
          border: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="invoice-shell">
      <div class="top-accent"></div>
      <div class="header">
        <div class="brand-block">
          <div>${logoMarkup}</div>
          <div class="brand-copy">
            <div class="eyebrow">Invoice</div>
            <div class="brand">${INVOICE_BRAND_NAME}</div>
          </div>
        </div>
        <div class="meta-panel">
          <div class="meta-row"><span class="meta-label">Invoice #</span><span class="meta-value">${escapeInvoiceHtml(publicId)}</span></div>
          <div class="meta-row"><span class="meta-label">Date</span><span class="meta-value">${escapeInvoiceHtml(dateStr)}</span></div>
          <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value"><span class="badge">${escapeInvoiceHtml(order.status || 'pending')}</span></span></div>
        </div>
      </div>

      <div class="content">
        <div class="details-grid">
          <div class="card">
            <div class="card-title">Bill To</div>
            <div class="line"><strong>${escapeInvoiceHtml(identity)}:</strong> ${escapeInvoiceHtml(titleName)}</div>
            <div class="line"><strong>Email:</strong> ${escapeInvoiceHtml(email)}</div>
            <div class="line"><strong>Phone:</strong> ${escapeInvoiceHtml(phone)}</div>
          </div>
          <div class="card">
            <div class="card-title">Shipping Address</div>
            <div class="address-block">${formatInvoiceAddressHtml(order.shipping_address)}</div>
          </div>
        </div>

        <div class="table-card">
          <div class="table-title">Items</div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Product</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <div class="summary-wrap">
          <div class="summary-card">
            <div class="summary-row">
              <span class="label">Subtotal</span>
              <span class="value">${formatInvoiceMoney(subtotal)}</span>
            </div>
            <div class="summary-row">
              <span class="label">Discount ${order.coupon_code ? `(${escapeInvoiceHtml(order.coupon_code)})` : ''}</span>
              <span class="value">- ${formatInvoiceMoney(discount)}</span>
            </div>
            <div class="summary-row">
              <span class="label">Shipping</span>
              <span class="value">${formatInvoiceMoney(shippingFee)}</span>
            </div>
            <div class="summary-row total">
              <span class="label">Grand Total</span>
              <span class="value">${formatInvoiceMoney(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        This is a system-generated invoice from ${INVOICE_BRAND_NAME}. If you have questions, contact support.
      </div>
    </div>
    ${
      includePrintScript
        ? `<script>
      window.onload = function() {
        setTimeout(function(){ window.print(); }, 300);
      };
    </script>`
        : ''
    }
  </body>
</html>
  `;
};

const buildInvoicePdfBuffer = ({ order }) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { titleName, identity, email, phone } = getInvoiceRecipientDetails(order);
      const shippingFee = Number(order.shipping_fee || 0);
      const subtotal = Number(order.total_amount || 0) + Number(order.discount_amount || 0) - shippingFee;
      const discount = Number(order.discount_amount || 0);
      const total = Number(order.total_amount || 0);
      const dateStr = new Date(order.created_at || Date.now()).toLocaleString();
      const publicId = buildPublicOrderId(order) || order.id;

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right;
      const topY = doc.page.margins.top;
      const footerY = doc.page.height - doc.page.margins.bottom - 10;
      const contentBottom = doc.page.height - doc.page.margins.bottom - 48;
      const productWidth = pageWidth * 0.52;
      const qtyWidth = pageWidth * 0.12;
      const priceWidth = pageWidth * 0.18;
      const totalWidth = pageWidth - productWidth - qtyWidth - priceWidth;
      const tableX = leftX;
      const qtyX = tableX + productWidth;
      const priceX = qtyX + qtyWidth;
      const totalX = priceX + priceWidth;

      const logoBuf = getInvoiceLogoBuffer();
      const drawFooter = () => {
        doc.fontSize(8).fillColor('#6b7280').text(
          `This is a system-generated invoice from ${INVOICE_BRAND_NAME}.`,
          leftX,
          footerY,
          { width: pageWidth, align: 'center' },
        );
      };

      const drawHeader = ({ continued = false }) => {
        doc.save();
        doc.roundedRect(leftX, topY, pageWidth, 92, 16).fillAndStroke('#fffaf5', '#fdba74');
        if (logoBuf) {
          try {
            doc.image(logoBuf, leftX + 18, topY + 16, { height: 56, width: 140, fit: [140, 56] });
          } catch {}
        }
        const brandX = logoBuf ? leftX + 160 : leftX + 20;
        const metaBoxX = rightX - 220;
        const brandWidth = Math.max(170, metaBoxX - brandX - 16);
        doc.fillColor('#ea580c').fontSize(10).font('Helvetica-Bold')
          .text(continued ? 'INVOICE CONTINUED' : 'INVOICE', brandX, topY + 16);
        doc.fillColor('#111827').fontSize(18).font('Helvetica-Bold')
          .text(INVOICE_BRAND_NAME, brandX, topY + 30, { width: brandWidth, lineGap: 1 });
        doc.roundedRect(metaBoxX, topY + 14, 200, 62, 12).fillAndStroke('#ffffff', '#e5e7eb');
        doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
          .text('Invoice #', metaBoxX + 14, topY + 24)
          .text('Date', metaBoxX + 14, topY + 41)
          .text('Status', metaBoxX + 14, topY + 58);
        doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold')
          .text(String(publicId), metaBoxX + 84, topY + 24, { width: 102, align: 'right' })
          .text(dateStr, metaBoxX + 84, topY + 41, { width: 102, align: 'right' })
          .text(String(order.status || 'pending'), metaBoxX + 84, topY + 58, { width: 102, align: 'right' });
        doc.restore();
        return topY + 100;
      };

      const drawInfoCards = (startY) => {
        const gap = 16;
        const boxWidth = (pageWidth - gap) / 2;
        const boxPadding = 14;
        const billingLines = [
          `${identity}: ${titleName}`,
          `Email: ${email}`,
          `Phone: ${phone}`,
        ];
        const shippingText = String(order.shipping_address || '-');
        const billingTextHeight = billingLines.reduce((sum, line) => (
          sum + doc.heightOfString(line, { width: boxWidth - boxPadding * 2 })
        ), 0);
        const shippingTextHeight = doc.heightOfString(shippingText, {
          width: boxWidth - boxPadding * 2,
        });
        const boxHeight = Math.max(96, billingTextHeight + 48, shippingTextHeight + 48);

        doc.roundedRect(leftX, startY, boxWidth, boxHeight, 14).fillAndStroke('#ffffff', '#e5e7eb');
        doc.roundedRect(leftX + boxWidth + gap, startY, boxWidth, boxHeight, 14).fillAndStroke('#ffffff', '#e5e7eb');

        doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold').text('Bill To', leftX + boxPadding, startY + 14);
        doc.fillColor('#111827').fontSize(10).font('Helvetica');
        let billY = startY + 36;
        billingLines.forEach((line) => {
          doc.text(line, leftX + boxPadding, billY, { width: boxWidth - boxPadding * 2 });
          billY += doc.heightOfString(line, { width: boxWidth - boxPadding * 2 }) + 4;
        });

        doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
          .text('Shipping Address', leftX + boxWidth + gap + boxPadding, startY + 14);
        doc.fillColor('#111827').fontSize(10).font('Helvetica')
          .text(shippingText, leftX + boxWidth + gap + boxPadding, startY + 36, {
            width: boxWidth - boxPadding * 2,
            lineGap: 2,
          });

        return startY + boxHeight + 18;
      };

      const drawItemsHeader = (y) => {
        doc.roundedRect(tableX, y, pageWidth, 26, 8).fillAndStroke('#fff7ed', '#fdba74');
        doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold');
        doc.text('PRODUCT', tableX + 10, y + 8, { width: productWidth - 20 });
        doc.text('QTY', qtyX + 4, y + 8, { width: qtyWidth - 8, align: 'center' });
        doc.text('PRICE', priceX + 4, y + 8, { width: priceWidth - 8, align: 'right' });
        doc.text('TOTAL', totalX + 4, y + 8, { width: totalWidth - 8, align: 'right' });
        return y + 34;
      };

      let y = drawHeader({ continued: false });
      y = drawInfoCards(y);
      y = drawItemsHeader(y);

      const rows = Array.isArray(order.items) ? order.items : [];
      rows.forEach((it) => {
        const price = Number(it.price || 0);
        const qty = Number(it.quantity || 0);
        const lineTotal = price * qty;
        const itemName = getInvoiceItemName(it);
        const nameOnly = String(it.product_name || '-');
        const variantName = String(it.variant_name || '').trim();
        const nameHeight = doc.heightOfString(nameOnly, { width: productWidth - 20, lineGap: 2 });
        const rowHeight = Math.max(
          34,
          doc.heightOfString(itemName, { width: productWidth - 20, lineGap: 2 }) + 14,
        );

        if (y + rowHeight > contentBottom) {
          drawFooter();
          doc.addPage();
          y = drawHeader({ continued: true });
          y = drawItemsHeader(y);
        }

        doc.roundedRect(tableX, y, pageWidth, rowHeight, 8).fillAndStroke('#ffffff', '#e5e7eb');
        doc.moveTo(qtyX, y).lineTo(qtyX, y + rowHeight).strokeColor('#eef2f7').stroke();
        doc.moveTo(priceX, y).lineTo(priceX, y + rowHeight).strokeColor('#eef2f7').stroke();
        doc.moveTo(totalX, y).lineTo(totalX, y + rowHeight).strokeColor('#eef2f7').stroke();

        doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
          .text(nameOnly, tableX + 10, y + 9, { width: productWidth - 20, lineGap: 2 });
        if (variantName) {
          doc.fillColor('#6b7280').fontSize(8).font('Helvetica')
            .text(`Variant: ${variantName}`, tableX + 10, y + 9 + nameHeight + 2, { width: productWidth - 20 });
        }
        doc.fillColor('#111827').fontSize(10).font('Helvetica')
          .text(String(qty || 0), qtyX + 4, y + 10, { width: qtyWidth - 8, align: 'center' })
          .text(formatInvoiceMoney(price), priceX + 6, y + 10, { width: priceWidth - 12, align: 'right' })
          .text(formatInvoiceMoney(lineTotal), totalX + 6, y + 10, { width: totalWidth - 12, align: 'right' });

        y += rowHeight + 10;
      });

      const totalsHeight = 108;
      if (y + totalsHeight > contentBottom) {
        drawFooter();
        doc.addPage();
        y = drawHeader({ continued: true });
      }

      const totalsWidth = 240;
      const totalsX = rightX - totalsWidth;
      doc.roundedRect(totalsX, y, totalsWidth, totalsHeight, 14).fillAndStroke('#fffaf5', '#fdba74');
      const totalsLabelX = totalsX + 14;
      const totalsValueWidth = 96;
      const totalsValueX = totalsX + totalsWidth - totalsValueWidth - 14;

      doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
        .text('Subtotal', totalsLabelX, y + 16, { width: totalsWidth - totalsValueWidth - 28 })
        .text(`Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`, totalsLabelX, y + 36, {
          width: totalsWidth - totalsValueWidth - 28,
        })
        .text('Shipping', totalsLabelX, y + 56, { width: totalsWidth - totalsValueWidth - 28 });
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
        .text(formatInvoiceMoney(subtotal), totalsValueX, y + 16, { width: totalsValueWidth, align: 'right' })
        .text(`- ${formatInvoiceMoney(discount)}`, totalsValueX, y + 36, { width: totalsValueWidth, align: 'right' })
        .text(formatInvoiceMoney(shippingFee), totalsValueX, y + 56, { width: totalsValueWidth, align: 'right' });
      doc.moveTo(totalsX + 14, y + 80).lineTo(totalsX + totalsWidth - 14, y + 80).strokeColor('#fdba74').stroke();
      doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold')
        .text('Grand Total', totalsLabelX, y + 88, { width: totalsWidth - totalsValueWidth - 28 })
        .text(formatInvoiceMoney(total), totalsValueX, y + 88, { width: totalsValueWidth, align: 'right' });

      drawFooter();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

exports.buildInvoiceHtml = buildInvoiceHtml;
exports.buildPublicOrderId = buildPublicOrderId;
exports.buildInvoicePdfBuffer = buildInvoicePdfBuffer;

const sendOrderConfirmationEmail = async (orderId) => {
  try {
    const order = await Order.findByPk(orderId, {
      include: [
        {
          model: OrderItem,
          as: 'items',
        },
        { model: User, as: 'customer', attributes: ['name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['business_name', 'email', 'phone'] },
      ],
    });

    if (!order) {
      return;
    }

    const recipientEmail = order.customer?.email || order.wholesaler?.email;
    if (!recipientEmail) {
      return;
    }

    const recipientName =
      order.customer?.name || order.wholesaler?.business_name || 'Customer';

    const shippingFee = Number(order.shipping_fee || 0);
    const subtotal = Number(order.total_amount || 0) + Number(order.discount_amount || 0) - shippingFee;
    const discount = Number(order.discount_amount || 0);
    const total = Number(order.total_amount || 0);
    const dateStr = new Date(order.created_at).toLocaleString();
    const paymentMethod =
      (order.payment_method || 'cod').toLowerCase() === 'cod'
        ? 'Cash on Delivery'
        : 'Online Payment';

    const itemsRows = (order.items || [])
      .map((it) => {
        const price = Number(it.price || 0);
        const lineTotal = price * it.quantity;
        return `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${it.product_name}</td>
            <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eee;">${it.quantity}</td>
            <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">₹${price.toFixed(
              2,
            )}</td>
            <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">₹${lineTotal.toFixed(
              2,
            )}</td>
          </tr>
        `;
      })
      .join('');

    const text = [
      `Dear ${recipientName},`,
      '',
      `Thank you for your order #${order.id}.`,
      `Date: ${dateStr}`,
      `Total: ₹${total.toFixed(2)}`,
      `Payment Method: ${paymentMethod}`,
      `Status: ${order.status}`,
      '',
      'We will notify you when your order is processed.',
      '',
      'Regards,',
      'Ashoka',
    ].join('\n');

    const frontendBase =
      process.env.FRONTEND_BASE_URL ||
      process.env.STORE_FRONT_URL ||
      'https://www.example.com';

    const orderUrl = `${frontendBase.replace(/\/+$/, '')}/orders?orderId=${encodeURIComponent(
      order.id,
    )}`;

    const html = `
      <div style="margin:0;padding:24px;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:640px;margin:0 auto;">
          <tr>
            <td>
              <div style="text-align:center;margin-bottom:16px;color:#6b7280;font-size:12px;">
                Order confirmation from <span style="font-weight:600;color:#111827;">Ashoka</span>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 20px rgba(15,23,42,0.08);border:1px solid #e5e7eb;">
                <div style="background:linear-gradient(90deg,#b91c1c,#f97316);padding:18px 24px;color:#f9fafb;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">
                    <div style="font-size:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                      Ashoka
                    </div>
                    <div style="text-align:right;margin-top:6px;font-size:12px;">
                      <div style="font-weight:600;">Order Confirmed</div>
                      <div style="opacity:0.9;">Order #${order.id}</div>
                    </div>
                  </div>
                </div>

                <div style="padding:24px 24px 8px 24px;">
                  <p style="margin:0 0 8px 0;font-size:14px;color:#111827;">
                    Dear <span style="font-weight:600;">${recipientName}</span>,
                  </p>
                  <p style="margin:0 0 12px 0;font-size:14px;color:#374151;">
                    Thank you for shopping with <span style="font-weight:600;">Ashoka</span>. We have received your order
                    <span style="font-weight:600;">#${order.id}</span>.
                  </p>

                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:collapse;font-size:13px;">
                    <tr>
                      <td style="padding:8px 0;color:#6b7280;width:35%;">Order date</td>
                      <td style="padding:8px 0;color:#111827;font-weight:500;">${dateStr}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;">Payment method</td>
                      <td style="padding:4px 0;color:#111827;font-weight:500;">${paymentMethod}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:#6b7280;">Status</td>
                      <td style="padding:4px 0;">
                        <span style="display:inline-block;padding:2px 10px;border-radius:999px;background-color:#fef3c7;color:#92400e;font-size:12px;font-weight:600;text-transform:capitalize;">
                          ${order.status}
                        </span>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="padding:8px 24px 20px 24px;">
                  <div style="margin-top:8px;margin-bottom:8px;font-size:14px;font-weight:600;color:#111827;">
                    Order Summary
                  </div>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
                    <thead style="background-color:#f9fafb;">
                      <tr>
                        <th align="left" style="padding:8px 10px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Product</th>
                        <th align="center" style="padding:8px 10px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Qty</th>
                        <th align="right" style="padding:8px 10px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Price</th>
                        <th align="right" style="padding:8px 10px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsRows}
                    </tbody>
                  </table>

                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;font-size:13px;">
                    <tr>
                      <td align="right" style="padding:2px 0;color:#6b7280;">Subtotal</td>
                      <td align="right" style="padding:2px 0;color:#111827;font-weight:500;width:120px;">₹${subtotal.toFixed(
                        2,
                      )}</td>
                    </tr>
                    <tr>
                      <td align="right" style="padding:2px 0;color:#6b7280;">Discount</td>
                      <td align="right" style="padding:2px 0;color:#16a34a;font-weight:500;">-₹${discount.toFixed(
                        2,
                      )}</td>
                    </tr>
                    <tr>
                      <td align="right" style="padding:2px 0;color:#6b7280;">Shipping</td>
                      <td align="right" style="padding:2px 0;color:#111827;font-weight:500;">₹${shippingFee.toFixed(
                        2,
                      )}</td>
                    </tr>
                    <tr>
                      <td align="right" style="padding:6px 0;color:#111827;font-weight:700;border-top:1px solid #e5e7eb;">Grand Total</td>
                      <td align="right" style="padding:6px 0;color:#111827;font-weight:700;border-top:1px solid #e5e7eb;">₹${total.toFixed(
                        2,
                      )}</td>
                    </tr>
                  </table>

                  <div style="margin-top:20px;text-align:center;">
                    <a href="${orderUrl}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:linear-gradient(90deg,#b91c1c,#f97316);color:#f9fafb;text-decoration:none;font-size:13px;font-weight:600;">
                      Track your order
                    </a>
                  </div>

                  <p style="margin-top:14px;margin-bottom:0;font-size:12px;color:#6b7280;text-align:center;">
                    Tracking details will appear in your Orders page once the shipment is created.
                  </p>

                  <p style="margin-top:18px;margin-bottom:0;font-size:12px;color:#6b7280;text-align:center;">
                    We will process your order soon. If you have any questions, reply to this email.
                  </p>
                </div>
              </div>

              <div style="text-align:center;margin-top:16px;font-size:11px;color:#9ca3af;">
                © ${new Date().getFullYear()} Ashoka. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </div>
    `;

    const transport = createEmailTransport();
    const from =
      process.env.FROM_EMAIL ||
      process.env.ADMIN_EMAIL ||
      'no-reply@ecommerce-ashoka.local';

    const publicId = buildPublicOrderId(order) || order.id;
    const invoicePdf = await buildInvoicePdfBuffer({ order });

    await transport.sendMail({
      from,
      to: recipientEmail,
      subject: `Order #${order.id} confirmed`,
      text: [
        text,
        '',
        `Track your order: ${orderUrl}`,
        'Tracking details will appear once the shipment is created.',
      ].join('\n'),
      html,
      attachments: [
        {
          filename: `invoice-${publicId}.pdf`,
          content: invoicePdf,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    console.error('Order confirmation email error:', err);
  }
};

const triggerBorzoDeliveryCreation = async ({ order, customer, userType }) => {
  try {
    if (!order || !order.id) return;
    if (!order.shipping_address) return;

    const existing = await Shipment.findOne({
      where: { order_id: order.id, carrier: 'BORZO' },
      order: [['created_at', 'DESC']],
    });
    if (existing?.tracking_number) return;

    const customerName =
      userType === 'wholesaler'
        ? customer?.business_name || customer?.name || null
        : customer?.name || null;
    const customerPhone = customer?.phone || null;

    const { courierOrderId, raw } = await createBorzoDeliveryOrder({
      orderId: order.id,
      dropoff: {
        address: String(order.shipping_address),
        name: customerName,
        phone: customerPhone,
      },
      matter: `Ashoka order #${order.id}`,
    });

    const lastEvent = JSON.stringify({
      action: 'create-order',
      courier_order_id: courierOrderId,
      created_at: new Date().toISOString(),
      borzo_response: raw,
    });

    if (existing) {
      existing.tracking_number = courierOrderId;
      existing.status = 'created';
      existing.last_event = lastEvent;
      await existing.save();
      return;
    }

    await Shipment.create({
      order_id: order.id,
      tracking_number: courierOrderId,
      carrier: 'BORZO',
      status: 'created',
      last_event: lastEvent,
    });
  } catch (err) {
    console.error('Borzo create delivery error:', err?.details || err);
  }
};

exports.placeOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const userType = req.userType;
    const { shipping_address, payment_method, notes, coupon_code, billing_phone, phone } = req.body;

    if (!shipping_address) {
      await t.rollback();
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    const cart = await Cart.findOne({
      where: cartWhere,
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [{ model: Product, as: 'product' }]
        }
      ],
      transaction: t
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Cart is empty' });
    }

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of cart.items) {
      if (item.product.stock < item.quantity) {
        await t.rollback();
        return res.status(400).json({
          message: `Insufficient stock for product: ${item.product.name}. Available: ${item.product.stock}`
        });
      }

      await item.product.decrement('stock', { by: item.quantity, transaction: t });

      const itemTotal = parseFloat(item.price) * item.quantity;
      totalAmount += itemTotal;

      orderItemsData.push({
        product_id: item.product_id,
        product_name: item.product.name,
        quantity: item.quantity,
        price: item.price
      });
    }

    let discountAmount = 0;
    let appliedCoupon = null;
    if (coupon_code) {
      const now = new Date();
      const coupon = await Coupon.findOne({
        where: {
          code: coupon_code.trim().toUpperCase(),
          active: true,
          [Op.and]: [
            { [Op.or]: [{ start_date: null }, { start_date: { [Op.lte]: now } }] },
            { [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: now } }] }
          ]
        },
        transaction: t
      });
      if (coupon) {
        if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        } else if (coupon.min_order_value && totalAmount < parseFloat(coupon.min_order_value)) {
        } else {
          if (coupon.discount_type === 'percentage') {
            discountAmount = (totalAmount * parseFloat(coupon.discount_value)) / 100.0;
          } else {
            discountAmount = parseFloat(coupon.discount_value);
          }
          if (discountAmount > totalAmount) discountAmount = totalAmount;
          appliedCoupon = coupon;
        }
      }
    }

    let shippingFee = 0;
    try {
      const shippingResult = await calculateShippingFee({
        shippingAddress: shipping_address,
        customer: req.user,
        userType: req.userType,
        orderId: null,
        dropoffPhone: billing_phone || phone || null,
      });
      shippingFee = shippingResult.shippingFee;
    } catch (error) {
      await t.rollback();
      const details = error?.details?.data || null;
      const borzoErrors = Array.isArray(details?.errors)
        ? details.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
        : null;
      const paramErrorsRaw = details?.parameter_errors || details?.param_errors || null;
      const paramErrors = paramErrorsRaw ? JSON.stringify(paramErrorsRaw) : '';
      const message =
        borzoErrors && borzoErrors.length > 0
          ? `Borzo error: ${borzoErrors.join(', ')}${paramErrors ? ` | parameter_errors: ${paramErrors}` : ''}`
          : error?.message || 'Failed to calculate shipping';
      const statusCode =
        error?.code === 'BORZO_TOKEN_MISSING' || error?.code === 'BORZO_WAREHOUSE_ADDRESS_MISSING'
          ? 500
          : 400;
      return res.status(statusCode).json({ message });
    }

    const orderData = {
      total_amount: totalAmount - discountAmount + shippingFee,
      shipping_address,
      shipping_fee: shippingFee,
      payment_method: payment_method || 'cod',
      status: 'pending',
      notes
    };

    if (appliedCoupon) {
      orderData.coupon_code = appliedCoupon.code;
      orderData.discount_amount = discountAmount;
    }

    if (userType === 'wholesaler') {
      orderData.wholesaler_id = userId;
    } else {
      orderData.customer_id = userId;
    }

    const order = await Order.create(orderData, { transaction: t });

    for (const itemData of orderItemsData) {
      await OrderItem.create(
        {
          ...itemData,
          order_id: order.id
        },
        { transaction: t }
      );
    }

    await CartItem.destroy({
      where: { cart_id: cart.id },
      transaction: t
    });

    if (appliedCoupon) {
      await appliedCoupon.increment('used_count', { by: 1, transaction: t });
    }

    await t.commit();

    sendOrderConfirmationEmail(order.id);
    if ((order.payment_method || 'cod').toLowerCase() === 'cod') {
      triggerBorzoDeliveryCreation({ order, customer: req.user, userType: req.userType });
    }

    res.status(201).json({ message: 'Order placed successfully', orderId: order.id });
  } catch (error) {
    await t.rollback();
    console.error('Place order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.instantPurchase = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const userType = req.userType;
    const { product_id, quantity, shipping_address, payment_method, notes, coupon_code, billing_phone, phone } = req.body;

    if (!product_id || !quantity) {
      await t.rollback();
      return res.status(400).json({ message: 'Product ID and quantity are required' });
    }

    if (!shipping_address) {
      await t.rollback();
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const product = await Product.findByPk(product_id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Quantity must be a positive integer' });
    }

    if (product.stock < qty) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: `Insufficient stock. Available: ${product.stock}` });
    }

    let price = 0;
    if (userType === 'wholesaler') {
      price = product.wholesaler_price;
    } else {
      price = product.customer_price;
    }

    const numericPrice = parseFloat(price || 0);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Product price is not available' });
    }

    const totalAmountRaw = numericPrice * qty;

    let discountAmount = 0;
    let appliedCoupon = null;
    if (coupon_code) {
      const now = new Date();
      const coupon = await Coupon.findOne({
        where: {
          code: coupon_code.trim().toUpperCase(),
          active: true,
          [Op.and]: [
            { [Op.or]: [{ start_date: null }, { start_date: { [Op.lte]: now } }] },
            { [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: now } }] }
          ]
        },
        transaction: t
      });
      if (coupon) {
        if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        } else if (coupon.min_order_value && totalAmountRaw < parseFloat(coupon.min_order_value)) {
        } else {
          if (coupon.discount_type === 'percentage') {
            discountAmount = (totalAmountRaw * parseFloat(coupon.discount_value)) / 100.0;
          } else {
            discountAmount = parseFloat(coupon.discount_value);
          }
          if (discountAmount > totalAmountRaw) discountAmount = totalAmountRaw;
          appliedCoupon = coupon;
        }
      }
    }

    let shippingFee = 0;
    try {
      const shippingResult = await calculateShippingFee({
        shippingAddress: shipping_address,
        customer: req.user,
        userType: req.userType,
        orderId: null,
        dropoffPhone: billing_phone || phone || null,
      });
      shippingFee = shippingResult.shippingFee;
    } catch (error) {
      await t.rollback();
      const details = error?.details?.data || null;
      const borzoErrors = Array.isArray(details?.errors)
        ? details.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
        : null;
      const paramErrorsRaw = details?.parameter_errors || details?.param_errors || null;
      const paramErrors = paramErrorsRaw ? JSON.stringify(paramErrorsRaw) : '';
      const message =
        borzoErrors && borzoErrors.length > 0
          ? `Borzo error: ${borzoErrors.join(', ')}${paramErrors ? ` | parameter_errors: ${paramErrors}` : ''}`
          : error?.message || 'Failed to calculate shipping';
      const statusCode =
        error?.code === 'BORZO_TOKEN_MISSING' || error?.code === 'BORZO_WAREHOUSE_ADDRESS_MISSING'
          ? 500
          : 400;
      return res.status(statusCode).json({ message });
    }

    const finalAmount = totalAmountRaw - discountAmount + shippingFee;

    await product.decrement('stock', { by: qty, transaction: t });

    const orderData = {
      total_amount: finalAmount,
      shipping_address,
      shipping_fee: shippingFee,
      payment_method: payment_method || 'cod',
      status: 'pending',
      notes
    };

    if (appliedCoupon) {
      orderData.coupon_code = appliedCoupon.code;
      orderData.discount_amount = discountAmount;
    }

    if (userType === 'wholesaler') {
      orderData.wholesaler_id = userId;
    } else {
      orderData.customer_id = userId;
    }

    const order = await Order.create(orderData, { transaction: t });

    await OrderItem.create(
      {
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        price: numericPrice
      },
      { transaction: t }
    );

    if (appliedCoupon) {
      await appliedCoupon.increment('used_count', { by: 1, transaction: t });
    }

    await t.commit();

    sendOrderConfirmationEmail(order.id);
    if ((order.payment_method || 'cod').toLowerCase() === 'cod') {
      triggerBorzoDeliveryCreation({ order, customer: req.user, userType: req.userType });
    }

    res.status(201).json({ message: 'Order placed successfully', orderId: order.id });
  } catch (error) {
    await t.rollback();
    console.error('Instant purchase error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.userType;
    const { scope } = req.query;
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);
    const shouldPaginate = Number.isFinite(rawPage) || Number.isFinite(rawLimit);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
    const offset = (page - 1) * limit;

    let whereClause = {};
    if (userType === 'wholesaler') {
      whereClause = { wholesaler_id: userId };
    } else {
      whereClause = { customer_id: userId };
    }

    if (scope === 'recent') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      whereClause.created_at = { [Op.gte]: thirtyDaysAgo };
    }

    const include = [
      {
        model: OrderItem,
        as: 'items',
        include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
      },
    ];

    const query = shouldPaginate
      ? await Order.findAndCountAll({
          where: whereClause,
          order: [['created_at', 'DESC']],
          include,
          distinct: true,
          limit,
          offset,
        })
      : {
          count: null,
          rows: await Order.findAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            include,
          }),
        };

    const result = (query.rows || []).map((o) => {
      const plain = normalizeOrderImages(o.toJSON());
      return {
        ...plain,
        display_order_id: buildPublicOrderId(plain),
      };
    });

    if (!shouldPaginate) {
      return res.status(200).json(result);
    }

    const total = Number(query.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
    return res.status(200).json({
      orders: result,
      total,
      totalPages,
      currentPage: page,
      limit,
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userType = req.userType;

    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorization check
    let isAuthorized = false;
    if (userType === 'wholesaler' && order.wholesaler_id === userId) isAuthorized = true;
    if (userType === 'customer' && order.customer_id === userId) isAuthorized = true;
    
    // Allow admin (if we use this controller for admin too, but let's keep it strict here or check for admin role if we unify)
    // For now, let's assume this endpoint is for users/wholesalers. Admin has separate endpoints usually.
    // But if we want to reuse:
    // if (req.admin) isAuthorized = true; 

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const shipmentsRaw = await Shipment.findAll({
      where: { order_id: order.id },
      order: [['created_at', 'DESC']],
    });
    const hasBorzo = shipmentsRaw.some((s) => String(s.carrier || '').toUpperCase() === 'BORZO');
    const shipments = (hasBorzo
      ? shipmentsRaw.filter((s) => String(s.carrier || '').toUpperCase() === 'BORZO')
      : shipmentsRaw
    ).map((s) => {
      const plainShipment = s.toJSON();
      return {
        id: plainShipment.id,
        carrier: plainShipment.carrier,
        tracking_number: plainShipment.tracking_number,
        status: plainShipment.status,
        created_at: plainShipment.created_at,
      };
    });

    const plain = order.toJSON();
    res.status(200).json({
      ...normalizeOrderImages(plain),
      display_order_id: buildPublicOrderId(plain),
      shipments,
    });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }]
        },
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'business_name', 'email', 'phone'] }
      ]
    });
    if (!order) {
      return res.status(404).send('Order not found');
    }

    let isAuthorized = false;
    if (req.admin) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'wholesaler' && order.wholesaler_id === req.user.id) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'customer' && order.customer_id === req.user.id) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      return res.status(403).send('Access denied');
    }

    if (order.status !== 'delivered') {
      return res.status(400).send('Invoice available only after delivery');
    }
    const html = buildInvoiceHtml({ order, includePrintScript: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Get order invoice error:', error);
    res.status(500).send('Server error');
  }
};

exports.getOrderInvoiceDownload = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
        },
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'business_name', 'email', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).send('Order not found');
    }

    let isAuthorized = false;
    if (req.admin) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'wholesaler' && order.wholesaler_id === req.user.id) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'customer' && order.customer_id === req.user.id) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      return res.status(403).send('Access denied');
    }

    const html = buildInvoiceHtml({ order, includePrintScript: false });
    const publicId = buildPublicOrderId(order) || order.id;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${publicId}.html"`);
    res.status(200).send(html);
  } catch (error) {
    console.error('Get order invoice download error:', error);
    res.status(500).send('Server error');
  }
};

exports.getOrderInvoicePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
        },
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'business_name', 'email', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).send('Order not found');
    }

    let isAuthorized = false;
    if (req.admin) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'wholesaler' && order.wholesaler_id === req.user.id) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'customer' && order.customer_id === req.user.id) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      return res.status(403).send('Access denied');
    }

    if (order.status !== 'delivered') {
      return res.status(400).send('Invoice available only after delivery');
    }

    const pdf = await buildInvoicePdfBuffer({ order });
    const publicId = buildPublicOrderId(order) || order.id;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${publicId}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    console.error('Get order invoice pdf error:', error);
    res.status(500).send('Server error');
  }
};

exports.getOrderInvoicePdfDownload = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
        },
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'business_name', 'email', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).send('Order not found');
    }

    let isAuthorized = false;
    if (req.admin) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'wholesaler' && order.wholesaler_id === req.user.id) {
      isAuthorized = true;
    }
    if (req.user && req.userType === 'customer' && order.customer_id === req.user.id) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      return res.status(403).send('Access denied');
    }

    const pdf = await buildInvoicePdfBuffer({ order });
    const publicId = buildPublicOrderId(order) || order.id;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${publicId}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    console.error('Get order invoice pdf download error:', error);
    res.status(500).send('Server error');
  }
};

exports.cancelMyOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userType = req.userType;

    const order = await Order.findByPk(id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: Product, as: 'product' }]
        }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }

    if (userType === 'wholesaler' && order.wholesaler_id !== userId) {
      await t.rollback();
      return res.status(403).json({ message: 'Access denied' });
    }
    if (userType === 'customer' && order.customer_id !== userId) {
      await t.rollback();
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!['pending', 'processing'].includes(order.status)) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: 'Only pending or processing orders can be cancelled' });
    }

    for (const item of order.items || []) {
      if (item.product) {
        await item.product.increment('stock', { by: item.quantity, transaction: t });
      }
    }

    order.status = 'cancelled';
    await order.save({ transaction: t });

    await t.commit();

    try {
      const shipment = await Shipment.findOne({
        where: { order_id: order.id, carrier: 'BORZO' },
        order: [['created_at', 'DESC']],
      });
      if (shipment && shipment.tracking_number && shipment.status !== 'cancelled' && shipment.status !== 'delivered') {
        try {
          const data = await cancelBorzoOrder(shipment.tracking_number);
          shipment.status = 'cancelled';
          shipment.last_event = JSON.stringify({
            action: 'cancel-order',
            cancelled_at: new Date().toISOString(),
            borzo_response: data,
          });
          await shipment.save();
        } catch (e) {
          console.error('Borzo cancel error:', e?.details || e);
        }
      }
    } catch (e) {
      console.error('Borzo cancel handler error:', e);
    }

    res.status(200).json({ message: 'Order cancelled successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Cancel my order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Admin Controllers
exports.getAllOrders = async (req, res) => {
  try {
    const { status, type, from, to, page = 1, limit = 10, userId, wholesalerId } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};
    if (status) {
      whereClause.status = status;
    }
    if (from || to) {
      whereClause.created_at = {};
      if (from) whereClause.created_at[Op.gte] = new Date(from);
      if (to) whereClause.created_at[Op.lte] = new Date(to);
    }

    if (userId) {
        whereClause.customer_id = userId;
    } else if (wholesalerId) {
        whereClause.wholesaler_id = wholesalerId;
    } else {
        if (type === 'customer') {
            whereClause.customer_id = { [Op.ne]: null };
        } else if (type === 'wholesaler') {
            whereClause.wholesaler_id = { [Op.ne]: null };
        }
    }

    const { count, rows } = await Order.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'name', 'business_name', 'email', 'phone'] },
        { model: OrderItem, as: 'items', attributes: ['id', 'product_name', 'quantity', 'price'] }
      ]
    });

    const mappedOrders = rows.map((o) => {
      const plain = o.toJSON();
      return {
        ...plain,
        display_order_id: buildPublicOrderId(plain),
      };
    });

    res.status(200).json({
      orders: mappedOrders,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalOrders: count
    });
  } catch (error) {
    console.error('Admin get all orders error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Admin can move orders through workflow, but cannot cancel them from here.
    if (!['pending', 'processing', 'shipped', 'delivered'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await Order.findByPk(id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'business_name', 'email', 'phone'] }
      ]
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = status;
    await order.save();

    if (status === 'delivered') {
      const recipient = order.customer?.email || order.wholesaler?.email || null;
      if (recipient) {
        const html = buildInvoiceHtml({ order, includePrintScript: false });
        const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
        const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '0', 10);
        const user = process.env.SMTP_USER || process.env.MAIL_USER;
        const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
        const from = process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || 'no-reply@ecommerce-ashoka.local';
        const transport = host && port && user && pass
          ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
          : nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
        await transport.sendMail({
          from,
          to: recipient,
          subject: `Invoice #${order.id}`,
          html
        });
      }
    }

    res.status(200).json({ message: 'Order status updated', order });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteOrderAdmin = async (req, res) => {
  let t;
  try {
    const { id } = req.params;

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (
      String(order.payment_method || '').toLowerCase() === 'online' &&
      String(order.payment_status || '').toLowerCase() === 'paid'
    ) {
      return res.status(400).json({ message: 'Refund this order before deleting it' });
    }

    const shipments = await Shipment.findAll({ where: { order_id: id } });
    const activeBorzoShipments = shipments.filter((s) => {
      const carrier = String(s.carrier || '').toUpperCase();
      const status = String(s.status || '').toLowerCase();
      return carrier === 'BORZO' && !['delivered', 'cancelled'].includes(status);
    });

    for (const s of activeBorzoShipments) {
      if (!s.tracking_number) continue;
      try {
        await cancelBorzoOrder(s.tracking_number);
      } catch (e) {
        return res.status(400).json({
          message: 'Unable to cancel active Borzo shipment. Please try again or cancel it first.',
          error: e?.message || String(e),
        });
      }
    }

    t = await sequelize.transaction();
    await Shipment.destroy({ where: { order_id: id }, transaction: t });
    await OrderItem.destroy({ where: { order_id: id }, transaction: t });
    await Order.destroy({ where: { id }, transaction: t });
    await t.commit();

    return res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Admin delete order error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
