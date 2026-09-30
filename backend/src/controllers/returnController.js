const { ReturnRequest, Order, OrderItem, Product, ProductImage, User, Wholesaler } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const normalizePhotos = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getUploadDirs = () => {
  const backendUploadsDir = path.join(__dirname, '../uploads');
  const backendUploadsDirAlt = path.join(__dirname, '../../uploads');
  const repoRootUploadsDir = path.join(__dirname, '../../../uploads');
  const cwdUploadsDir = path.join(process.cwd(), 'uploads');
  const envUploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : null;
  const linuxSymlinkUploadsDir =
    process.platform !== 'win32' && fs.existsSync('/var/www/ashoka_web/uploads') ? '/var/www/ashoka_web/uploads' : null;
  const linuxPersistentUploadsDir =
    process.platform !== 'win32' && fs.existsSync('/var/lib/ashoka_uploads') ? '/var/lib/ashoka_uploads' : null;

  return Array.from(
    new Set(
      [
        envUploadsDir,
        linuxSymlinkUploadsDir,
        linuxPersistentUploadsDir,
        backendUploadsDir,
        backendUploadsDirAlt,
        repoRootUploadsDir,
        cwdUploadsDir,
      ].filter(Boolean)
    )
  );
};

const fileExistsInUploads = (filename) => {
  if (!filename) return false;
  for (const dir of getUploadDirs()) {
    try {
      if (fs.existsSync(path.join(dir, filename))) return true;
    } catch {}
  }
  return false;
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

exports.createReturnRequest = async (req, res) => {
  try {
    if (req.userType !== 'customer') {
      return res.status(403).json({ message: 'Only customers can request returns' });
    }

    const orderId = parseInt(req.body?.order_id, 10);
    const reason = String(req.body?.reason || '').trim();
    const message = req.body?.message != null ? String(req.body.message).trim() : null;

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order_id' });
    }
    if (!reason) {
      return res.status(400).json({ message: 'Reason is required' });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (String(order.status || '').toLowerCase() !== 'delivered') {
      return res.status(400).json({ message: 'Return can be requested only after delivery' });
    }

    const already = await ReturnRequest.findOne({
      where: {
        order_id: orderId,
        customer_id: req.user.id,
        status: { [Op.notIn]: ['rejected', 'closed'] },
      },
    });
    if (already) {
      return res.status(409).json({ message: 'A return request already exists for this order' });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const photos = files
      .filter((file) => {
        if (!file?.filename) return false;
        if (file?.path && typeof file.path === 'string' && fs.existsSync(file.path)) return true;
        return fileExistsInUploads(file.filename);
      })
      .map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      }));

    const created = await ReturnRequest.create({
      order_id: orderId,
      customer_id: req.user.id,
      reason,
      message: message || null,
      photos: photos.length > 0 ? photos : null,
      status: 'requested',
    });

    return res.status(201).json({ message: 'Return request submitted successfully', request: created });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getMyReturnRequests = async (req, res) => {
  try {
    if (req.userType !== 'customer') {
      return res.status(403).json({ message: 'Only customers can view return requests' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await ReturnRequest.findAndCountAll({
      where: { customer_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Order,
          as: 'order',
          include: [
            {
              model: OrderItem,
              as: 'items',
              include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
            },
          ],
        },
      ],
      distinct: true,
    });

    const mapped = rows.map((r) => {
      const plain = r.toJSON();
      return { ...plain, photos: normalizePhotos(plain.photos) };
    });

    return res.json({
      requests: mapped,
      total: Number(count || 0),
      totalPages: Math.max(1, Math.ceil(Number(count || 0) / Math.max(1, limit))),
      currentPage: page,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAdminReturnRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
    const offset = (page - 1) * limit;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : '';

    const where = {};
    if (status) where.status = status;

    const { count, rows } = await ReturnRequest.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: Order,
          as: 'order',
          include: [
            { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
            { model: Wholesaler, as: 'wholesaler', attributes: ['id', 'name', 'business_name', 'email', 'phone'] },
            {
              model: OrderItem,
              as: 'items',
              include: [{ model: Product, as: 'product', include: [{ model: ProductImage, as: 'images' }] }],
            },
          ],
        },
      ],
      distinct: true,
    });

    const mapped = rows.map((r) => {
      const plain = r.toJSON();
      const customer = plain.customer || plain.order?.customer || plain.order?.wholesaler || null;
      return { ...plain, customer, photos: normalizePhotos(plain.photos) };
    });

    return res.json({
      requests: mapped,
      total: Number(count || 0),
      totalPages: Math.max(1, Math.ceil(Number(count || 0) / Math.max(1, limit))),
      currentPage: page,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateReturnRequestStatusAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body?.status || '').trim().toLowerCase();
    const adminNote = req.body?.admin_note != null ? String(req.body.admin_note).trim() : null;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const allowed = new Set(['requested', 'approved', 'rejected', 'picked_up', 'refunded', 'closed']);
    if (!allowed.has(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const request = await ReturnRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    request.status = status;
    request.admin_note = adminNote || request.admin_note || null;
    if (status === 'rejected' || status === 'refunded' || status === 'closed') {
      request.resolved_at = new Date();
    }
    await request.save();

    return res.json({ message: 'Return request updated successfully', request });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.emailReturnCustomerAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const subject = String(req.body?.subject || '').trim().slice(0, 200);
    const message = String(req.body?.message || '').trim().slice(0, 8000);

    if (!subject) return res.status(400).json({ message: 'Subject is required' });
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const request = await ReturnRequest.findByPk(id, {
      include: [
        { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
        { model: Order, as: 'order', attributes: ['id', 'display_order_id', 'status'] },
      ],
    });
    if (!request) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    const email = request?.customer?.email ? String(request.customer.email).trim() : '';
    if (!email) {
      return res.status(400).json({ message: 'Customer email is not available' });
    }

    const transport = createEmailTransport();
    const from = process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || process.env.MAIL_USER || 'no-reply@ecommerce-ashoka.local';
    const customerName = request?.customer?.name || 'Customer';
    const orderId = request?.order?.display_order_id || request?.order?.id || request?.order_id || '';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5">
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>${message.replace(/\n/g, '<br />')}</p>
        ${orderId ? `<p style="margin-top:14px;color:#555">Order: <strong>${orderId}</strong></p>` : ''}
        <p style="margin-top:18px;color:#777;font-size:12px">Ashoka Support</p>
      </div>
    `;

    const info = await transport.sendMail({
      from,
      to: email,
      subject,
      text: message,
      html,
    });

    return res.json({
      message: `Email sent to ${email}`,
      ...(process.env.NODE_ENV !== 'production' && info?.message ? { preview: String(info.message) } : {}),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
