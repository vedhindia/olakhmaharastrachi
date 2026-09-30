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
      path.join(__dirname, '../../../Ashoka/src/assets/images/logo.png'),
      path.join(__dirname, '../../../admin-panel/src/assets/logo.png'),
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
      path.join(__dirname, '../../../Ashoka/src/assets/images/logo.png'),
      path.join(__dirname, '../../../admin-panel/src/assets/logo.png'),
    ];
    const logoPath = candidates.find((p) => fs.existsSync(p));
    if (!logoPath) return null;
    return fs.readFileSync(logoPath);
  } catch {
    return null;
  }
};

const buildInvoiceHtml = ({ order, includePrintScript }) => {
  const titleName = order.customer
    ? order.customer.name
    : order.wholesaler
      ? order.wholesaler.business_name
      : 'Customer';
  const identity = order.customer ? 'Customer' : 'Wholesaler';
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
        ? `<img src="${imageUrl}" alt="${it.product_name}" style="width:40px;height:40px;object-fit:cover;margin-right:8px;border-radius:4px;border:1px solid #eee;" />`
        : '';
      return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${imageMarkup}
            <span>${it.product_name}</span>
          </div>
        </td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${Number(it.price).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(Number(it.price) * it.quantity).toFixed(2)}</td>
      </tr>
    `;
    })
    .join('');

  const logoMarkup = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo" style="height:44px;object-fit:contain;display:block;margin-bottom:6px;" />`
    : '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${order.id}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; color: #222; }
      .container { max-width: 900px; margin: 24px auto; padding: 24px; border: 1px solid #ddd; border-radius: 8px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 16px; }
      .brand { font-weight: 700; font-size: 20px; }
      .meta { text-align: right; font-size: 14px; color: #555; }
      .section { margin-top: 16px; }
      .section h3 { margin: 0 0 8px 0; font-size: 16px; color: #333; }
      table { width: 100%; border-collapse: collapse; }
      .totals td { padding: 6px; }
      .totals .label { text-align: right; color: #555; }
      .totals .value { text-align: right; font-weight: 600; }
      .footer { margin-top: 24px; font-size: 12px; color: #777; text-align: center; }
      .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; background: #e8f5e9; color: #2e7d32; font-size: 12px; text-transform: capitalize; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          ${logoMarkup}
          <div class="brand">Ashoka</div>
          <div style="color:#777;font-size:12px;">Invoice</div>
        </div>
        <div class="meta">
          <div>Invoice #: ${publicId}</div>
          <div>Date: ${dateStr}</div>
          <div>Status: <span class="badge">${order.status || 'pending'}</span></div>
        </div>
      </div>

      <div class="section">
        <h3>Bill To</h3>
        <div style="border:1px solid #eee;padding:12px;border-radius:6px;">
          <div><strong>${identity}:</strong> ${titleName}</div>
          <div><strong>Email:</strong> ${order.customer?.email || order.wholesaler?.email || '-'}</div>
          <div><strong>Phone:</strong> ${order.customer?.phone || order.wholesaler?.phone || '-'}</div>
        </div>
      </div>

      <div class="section">
        <h3>Shipping Address</h3>
        <div style="border:1px solid #eee;padding:12px;border-radius:6px;">
          ${order.shipping_address || '-'}
        </div>
      </div>

      <div class="section">
        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Product</th>
              <th style="text-align:center;padding:8px;border-bottom:1px solid #ccc;">Qty</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc;">Price</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <table class="totals">
          <tr>
            <td class="label" style="width:80%;">Subtotal</td>
            <td class="value" style="width:20%;">₹${subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label">Discount ${order.coupon_code ? '(' + order.coupon_code + ')' : ''}</td>
            <td class="value">-₹${discount.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label">Shipping</td>
            <td class="value">₹${shippingFee.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label"><strong>Grand Total</strong></td>
            <td class="value"><strong>₹${total.toFixed(2)}</strong></td>
          </tr>
        </table>
      </div>

      <div class="footer">
        This is a system-generated invoice. If you have questions, contact support.
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

      const formatMoney = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

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

      const logoBuf = getInvoiceLogoBuffer();
      if (logoBuf) {
        try {
          doc.image(logoBuf, leftX, topY, { height: 38 });
        } catch {}
      }

      const brandX = logoBuf ? leftX + 90 : leftX;
      doc.fontSize(18).fillColor('#111827').text('Ashoka', brandX, topY + 2);
      doc.fontSize(10).fillColor('#6b7280').text('Invoice', brandX, topY + 26);

      doc.fontSize(10).fillColor('#111827');
      doc.text(`Invoice #: ${publicId}`, leftX, topY + 2, { width: pageWidth, align: 'right' });
      doc.text(`Date: ${dateStr}`, leftX, topY + 16, { width: pageWidth, align: 'right' });
      doc.text(`Status: ${(order.status || 'pending').toString()}`, leftX, topY + 30, {
        width: pageWidth,
        align: 'right',
      });

      doc.y = topY + 60;

      doc.moveDown(1.2);
      doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(leftX, doc.y).lineTo(rightX, doc.y).stroke();
      doc.moveDown(1);

      const customerName = order.customer
        ? order.customer.name
        : order.wholesaler
          ? order.wholesaler.business_name
          : 'Customer';
      const customerEmail = order.customer?.email || order.wholesaler?.email || '';
      const customerPhone = order.customer?.phone || order.wholesaler?.phone || '';

      doc.fontSize(11).fillColor('#111827').text('Bill To', leftX);
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#111827');
      doc.text(`Customer: ${customerName}`);
      if (customerEmail) doc.text(`Email: ${customerEmail}`);
      if (customerPhone) doc.text(`Phone: ${customerPhone}`);

      doc.moveDown(0.8);
      doc.fontSize(11).fillColor('#111827').text('Shipping Address', leftX);
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#111827').text(String(order.shipping_address || '-'), {
        width: pageWidth,
      });

      doc.moveDown(1);
      doc.fontSize(11).fillColor('#111827').text('Items', leftX);
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colProduct = leftX;
      const colQty = leftX + pageWidth * 0.55;
      const colPrice = leftX + pageWidth * 0.70;
      const colTotal = leftX + pageWidth * 0.85;

      doc.fontSize(9).fillColor('#6b7280');
      doc.text('Product', colProduct, tableTop, { width: pageWidth * 0.55 });
      doc.text('Qty', colQty, tableTop, { width: pageWidth * 0.15, align: 'center' });
      doc.text('Price', colPrice, tableTop, { width: pageWidth * 0.15, align: 'right' });
      doc.text('Total', colTotal, tableTop, { width: pageWidth * 0.15, align: 'right' });

      doc.moveTo(leftX, tableTop + 14).lineTo(rightX, tableTop + 14).strokeColor('#e5e7eb').stroke();

      let y = tableTop + 22;
      doc.fontSize(10).fillColor('#111827');

      const rows = Array.isArray(order.items) ? order.items : [];
      rows.forEach((it) => {
        const price = Number(it.price || 0);
        const qty = Number(it.quantity || 0);
        const lineTotal = price * qty;
        const name = String(it.product_name || '-');

        doc.text(name, colProduct, y, { width: pageWidth * 0.55 });
        doc.text(String(qty || 0), colQty, y, { width: pageWidth * 0.15, align: 'center' });
        doc.text(formatMoney(price), colPrice, y, { width: pageWidth * 0.15, align: 'right' });
        doc.text(formatMoney(lineTotal), colTotal, y, {
          width: pageWidth * 0.15,
          align: 'right',
        });

        y += 18;
        doc.moveTo(leftX, y - 4).lineTo(rightX, y - 4).strokeColor('#f3f4f6').stroke();
      });

      doc.moveDown(2);
      const totalsTop = Math.max(doc.y, y + 10);
      const totalsLabelX = leftX + pageWidth * 0.60;
      const totalsValueX = leftX + pageWidth * 0.85;

      doc.fontSize(10).fillColor('#6b7280').text('Subtotal', totalsLabelX, totalsTop, {
        width: pageWidth * 0.20,
        align: 'right',
      });
      doc.fontSize(10).fillColor('#111827').text(formatMoney(subtotal), totalsValueX, totalsTop, {
        width: pageWidth * 0.15,
        align: 'right',
      });

      doc.fontSize(10).fillColor('#6b7280').text('Discount', totalsLabelX, totalsTop + 16, {
        width: pageWidth * 0.20,
        align: 'right',
      });
      doc.fontSize(10).fillColor('#111827').text(`- ${formatMoney(discount)}`, totalsValueX, totalsTop + 16, {
        width: pageWidth * 0.15,
        align: 'right',
      });

      doc.fontSize(10).fillColor('#6b7280').text('Shipping', totalsLabelX, totalsTop + 32, {
        width: pageWidth * 0.20,
        align: 'right',
      });
      doc.fontSize(10).fillColor('#111827').text(formatMoney(shippingFee), totalsValueX, totalsTop + 32, {
        width: pageWidth * 0.15,
        align: 'right',
      });

      doc.fontSize(11).fillColor('#111827').text('Grand Total', totalsLabelX, totalsTop + 52, {
        width: pageWidth * 0.20,
        align: 'right',
      });
      doc.fontSize(11).fillColor('#111827').text(formatMoney(total), totalsValueX, totalsTop + 52, {
        width: pageWidth * 0.15,
        align: 'right',
      });

      doc.moveDown(5);
      doc.fontSize(9).fillColor('#6b7280').text(
        'This is a system-generated invoice. If you have questions, contact support.',
        leftX,
        doc.page.height - doc.page.margins.bottom - 30,
        { width: pageWidth, align: 'center' },
      );

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
        const titleName = order.customer ? order.customer.name : (order.wholesaler ? order.wholesaler.business_name : 'Customer');
        const identity = order.customer ? 'Customer' : 'Wholesaler';
        const shippingFee = Number(order.shipping_fee || 0);
        const subtotal = Number(order.total_amount || 0) + Number(order.discount_amount || 0) - shippingFee;
        const discount = Number(order.discount_amount || 0);
        const total = Number(order.total_amount || 0);
        const dateStr = new Date(order.created_at).toLocaleString();
        const rows = (order.items || []).map((it) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${it.product_name}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${Number(it.price).toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(Number(it.price) * it.quantity).toFixed(2)}</td>
          </tr>
        `).join('');
        const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${order.id}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; color: #222; }
      .container { max-width: 900px; margin: 24px auto; padding: 24px; border: 1px solid #ddd; border-radius: 8px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
      .brand { font-weight: 700; font-size: 20px; }
      .meta { text-align: right; font-size: 14px; color: #555; }
      .section { margin-top: 16px; }
      .section h3 { margin: 0 0 8px 0; font-size: 16px; color: #333; }
      table { width: 100%; border-collapse: collapse; }
      .totals td { padding: 6px; }
      .totals .label { text-align: right; color: #555; }
      .totals .value { text-align: right; font-weight: 600; }
      .footer { margin-top: 24px; font-size: 12px; color: #777; text-align: center; }
      .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; background: #e8f5e9; color: #2e7d32; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="brand">Ecommerce Ashoka</div>
          <div style="color:#777;font-size:12px;">Invoice</div>
        </div>
        <div class="meta">
          <div>Invoice #: ${order.id}</div>
          <div>Date: ${dateStr}</div>
          <div>Status: <span class="badge">${order.status}</span></div>
        </div>
      </div>

      <div class="section">
        <h3>Bill To</h3>
        <div style="border:1px solid #eee;padding:12px;border-radius:6px;">
          <div><strong>${identity}:</strong> ${titleName}</div>
          <div><strong>Email:</strong> ${order.customer?.email || order.wholesaler?.email || '-'}</div>
          <div><strong>Phone:</strong> ${order.customer?.phone || order.wholesaler?.phone || '-'}</div>
        </div>
      </div>

      <div class="section">
        <h3>Shipping Address</h3>
        <div style="border:1px solid #eee;padding:12px;border-radius:6px;">
          ${order.shipping_address || '-'}
        </div>
      </div>

      <div class="section">
        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #ccc;">Product</th>
              <th style="text-align:center;padding:8px;border-bottom:1px solid #ccc;">Qty</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc;">Price</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ccc;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <table class="totals">
          <tr>
            <td class="label" style="width:80%;">Subtotal</td>
            <td class="value" style="width:20%;">₹${subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label">Discount ${order.coupon_code ? '(' + order.coupon_code + ')' : ''}</td>
            <td class="value">-₹${discount.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label">Shipping</td>
            <td class="value">₹${shippingFee.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label"><strong>Grand Total</strong></td>
            <td class="value"><strong>₹${total.toFixed(2)}</strong></td>
          </tr>
        </table>
      </div>

      <div class="footer">
        This is a system-generated invoice. If you have questions, contact support.
      </div>
    </div>
  </body>
</html>
        `;
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
