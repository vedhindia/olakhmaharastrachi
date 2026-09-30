const { Wholesaler, Cart, Order, Review } = require('../models');
const { Op } = require('sequelize');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const normalizeDocuments = (value) => {
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
  const backendUploadsDir = path.join(__dirname, '../../uploads');
  const repoRootUploadsDir = path.join(__dirname, '../../../uploads');
  const cwdUploadsDir = path.join(process.cwd(), 'uploads');
  const envUploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : null;
  const linuxSymlinkUploadsDir =
    process.platform !== 'win32' && fs.existsSync('/var/www/ashoka_web/uploads') ? '/var/www/ashoka_web/uploads' : null;
  const linuxPersistentUploadsDir =
    process.platform !== 'win32' && fs.existsSync('/var/lib/ashoka_uploads') ? '/var/lib/ashoka_uploads' : null;

  return Array.from(
    new Set(
      [envUploadsDir, linuxSymlinkUploadsDir, linuxPersistentUploadsDir, backendUploadsDir, repoRootUploadsDir, cwdUploadsDir]
        .filter(Boolean)
    )
  );
};

const fileExistsInUploads = (filename) => {
  if (!filename) return false;
  const dirs = getUploadDirs();
  for (const dir of dirs) {
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
      auth: { user, pass }
    });
  }

  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
};

const buildWholesalerStatusEmail = (wholesaler, status) => {
  const businessName = wholesaler.business_name || wholesaler.name || 'Wholesaler';
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || 'no-reply@ecommerce-ashoka.local';
  const portalUrl = process.env.WHOLESALER_PORTAL_URL || process.env.FRONTEND_URL || '';
  const loginUrlRaw =
    process.env.WHOLESALER_LOGIN_URL ||
    (portalUrl ? `${String(portalUrl).replace(/\/$/, '')}/wholesaler-login` : '');
  const loginUrl = loginUrlRaw && typeof loginUrlRaw === 'string' ? loginUrlRaw : '';

  if (status === 'approved') {
    return {
      subject: 'Your wholesaler account has been approved',
      text: `Hello ${businessName},\n\nYour wholesaler verification has been approved by the admin. You can now login.\n\n${loginUrl ? `Go to login: ${loginUrl}\n\n` : portalUrl ? `Website: ${portalUrl}\n\n` : ''}For any help, contact: ${supportEmail}\n`,
      html: `
        <p>Hello <strong>${businessName}</strong>,</p>
        <p>Your wholesaler verification has been <strong>approved</strong> by the admin. You can now login.</p>
        ${
          loginUrl
            ? `<p><a href="${loginUrl}" style="display:inline-block;padding:10px 14px;background:#8cc63f;color:#111;text-decoration:none;border-radius:8px;font-weight:700">Go to Login</a></p>
               <p style="margin-top:10px">Website: <a href="${portalUrl || loginUrl}">${portalUrl || loginUrl}</a></p>`
            : portalUrl
              ? `<p>Website: <a href="${portalUrl}">${portalUrl}</a></p>`
              : ''
        }
        <p>For any help, contact: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      `
    };
  }

  if (status === 'rejected') {
    return {
      subject: 'Your wholesaler verification was rejected',
      text: `Hello ${businessName},\n\nYour wholesaler verification was rejected by the admin.\nIf you believe this is a mistake, please contact: ${supportEmail}\n`,
      html: `
        <p>Hello <strong>${businessName}</strong>,</p>
        <p>Your wholesaler verification was <strong>rejected</strong> by the admin.</p>
        ${portalUrl ? `<p>Website: <a href="${portalUrl}">${portalUrl}</a></p>` : ''}
        <p>If you believe this is a mistake, please contact: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      `
    };
  }

  if (status === 'blocked') {
    return {
      subject: 'Your wholesaler account is not approved',
      text: `Hello ${businessName},\n\nYour wholesaler account is currently not approved. Please contact support for details: ${supportEmail}\n`,
      html: `
        <p>Hello <strong>${businessName}</strong>,</p>
        <p>Your wholesaler account is currently <strong>not approved</strong>.</p>
        ${portalUrl ? `<p>Website: <a href="${portalUrl}">${portalUrl}</a></p>` : ''}
        <p>Please contact support for details: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      `
    };
  }

  return {
    subject: 'Your wholesaler verification is pending',
    text: `Hello ${businessName},\n\nYour wholesaler verification is pending admin review.\nFor any help, contact: ${supportEmail}\n`,
    html: `
      <p>Hello <strong>${businessName}</strong>,</p>
      <p>Your wholesaler verification is <strong>pending</strong> admin review.</p>
      ${portalUrl ? `<p>Website: <a href="${portalUrl}">${portalUrl}</a></p>` : ''}
      <p>For any help, contact: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
    `
  };
};

// --- Wholesaler Side APIs ---

exports.getProfile = async (req, res) => {
  try {
    const wholesaler = await Wholesaler.findByPk(req.user.id);
    if (!wholesaler) {
      return res.status(404).json({ message: 'Wholesaler not found' });
    }
    res.json(wholesaler);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone, business_name, gst_number, address, city, state, pincode } = req.body;
    
    const wholesaler = await Wholesaler.findByPk(req.user.id);
    if (!wholesaler) {
      return res.status(404).json({ message: 'Wholesaler not found' });
    }

    // Check if email/phone is being changed to something that already exists
    if (email && email !== wholesaler.email) {
      const exists = await Wholesaler.findOne({ where: { email } });
      if (exists) return res.status(400).json({ message: 'Email already in use' });
    }
    if (phone && phone !== wholesaler.phone) {
        const exists = await Wholesaler.findOne({ where: { phone } });
        if (exists) return res.status(400).json({ message: 'Phone already in use' });
    }

    wholesaler.name = name || wholesaler.name;
    wholesaler.email = email || wholesaler.email;
    wholesaler.phone = phone || wholesaler.phone;
    wholesaler.business_name = business_name || wholesaler.business_name;
    wholesaler.gst_number = gst_number || wholesaler.gst_number;
    wholesaler.address = address || wholesaler.address;
    wholesaler.city = city || wholesaler.city;
    wholesaler.state = state || wholesaler.state;
    wholesaler.pincode = pincode || wholesaler.pincode;

    await wholesaler.save();

    res.json({ message: 'Profile updated successfully', wholesaler });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.uploadDocuments = async (req, res) => {
  try {
    const wholesaler = await Wholesaler.findByPk(req.user.id);
    if (!wholesaler) {
      return res.status(404).json({ message: 'Wholesaler not found' });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No documents uploaded' });
    }

    const existing = normalizeDocuments(wholesaler.documents);
    const incoming = files
      .filter((file) => {
        if (!file?.filename) return false;
        if (file?.path && typeof file.path === 'string' && fs.existsSync(file.path)) return true;
        return fileExistsInUploads(file.filename);
      })
      .map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      }));

    if (incoming.length === 0) {
      return res.status(500).json({ message: 'Upload failed: file not saved on server' });
    }

    const merged = [...existing];
    for (const doc of incoming) {
      if (!merged.some((d) => d && d.filename === doc.filename)) {
        merged.push(doc);
      }
    }

    wholesaler.documents = merged;
    await wholesaler.save();

    res.json({ message: 'Documents uploaded successfully', documents: normalizeDocuments(wholesaler.documents) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteWholesaler = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const wholesaler = await Wholesaler.findByPk(id, { transaction });
    if (!wholesaler) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Wholesaler not found' });
    }

    await Cart.update({ wholesaler_id: null }, { where: { wholesaler_id: id }, transaction });
    await Order.update({ wholesaler_id: null }, { where: { wholesaler_id: id }, transaction });
    await Review.update({ wholesaler_id: null }, { where: { wholesaler_id: id }, transaction });

    await wholesaler.destroy({ transaction });
    await transaction.commit();
    res.json({ message: 'Wholesaler deleted successfully' });
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {}
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Admin Side APIs ---

exports.getAllWholesalers = async (req, res) => {
  try {
    const { search, status, verified, from, to, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { business_name: { [Op.like]: `%${search}%` } }
      ];
    }

    if (status) whereClause.status = status;
    if (verified === 'true') whereClause.is_verified = true;
    if (verified === 'false') whereClause.is_verified = false;

    if (from || to) {
      whereClause.created_at = {};
      if (from) whereClause.created_at[Op.gte] = new Date(from);
      if (to) whereClause.created_at[Op.lte] = new Date(to);
    }

    const { count, rows } = await Wholesaler.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      wholesalers: rows.map((row) => {
        const plain = row?.get ? row.get({ plain: true }) : row;
        return { ...plain, documents: normalizeDocuments(plain?.documents) };
      }),
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.exportWholesalersCsv = async (req, res) => {
  try {
    const { search, status, verified, from, to } = req.query;
    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { business_name: { [Op.like]: `%${search}%` } }
      ];
    }
    if (status) whereClause.status = status;
    if (verified === 'true') whereClause.is_verified = true;
    if (verified === 'false') whereClause.is_verified = false;
    if (from || to) {
      whereClause.created_at = {};
      if (from) whereClause.created_at[Op.gte] = new Date(from);
      if (to) whereClause.created_at[Op.lte] = new Date(to);
    }

    const rows = await Wholesaler.findAll({ where: whereClause, order: [['created_at', 'DESC']] });
    const headers = ['id', 'business_name', 'name', 'email', 'phone', 'gst_number', 'is_verified', 'status', 'created_at'];
    const csv = [
      headers.join(','),
      ...rows.map(w => [
        w.id,
        JSON.stringify(w.business_name || ''),
        JSON.stringify(w.name || ''),
        JSON.stringify(w.email || ''),
        JSON.stringify(w.phone || ''),
        JSON.stringify(w.gst_number || ''),
        w.is_verified ? 'true' : 'false',
        w.status,
        w.created_at.toISOString()
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="wholesalers-export.csv"');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateWholesalerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved', 'rejected', 'blocked', 'pending'

    if (!['pending', 'approved', 'rejected', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const wholesaler = await Wholesaler.findByPk(id);
    if (!wholesaler) {
      return res.status(404).json({ message: 'Wholesaler not found' });
    }

    wholesaler.status = status;
    await wholesaler.save();

    let notificationSent = false;
    if (wholesaler.email) {
      try {
        const transport = createEmailTransport();
        const from = process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || 'no-reply@ecommerce-ashoka.local';
        const mail = buildWholesalerStatusEmail(wholesaler, status);
        await transport.sendMail({
          from,
          to: wholesaler.email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html
        });
        notificationSent = true;
      } catch {
        notificationSent = false;
      }
    }

    res.json({ message: `Wholesaler status updated to ${status}`, wholesaler, notificationSent });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.sendWholesalerStatusNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const requestedStatus = typeof req.body?.status === 'string' ? req.body.status : null;

    const wholesaler = await Wholesaler.findByPk(id);
    if (!wholesaler) {
      return res.status(404).json({ message: 'Wholesaler not found' });
    }

    const email = wholesaler.email;
    if (!email) {
      return res.status(400).json({ message: 'Wholesaler email is not available' });
    }

    const status = requestedStatus || wholesaler.status || 'pending';
    if (!['pending', 'approved', 'rejected', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const transport = createEmailTransport();
    const from = process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || 'no-reply@ecommerce-ashoka.local';
    const mail = buildWholesalerStatusEmail(wholesaler, status);

    const info = await transport.sendMail({
      from,
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html
    });

    res.json({
      message: `Notification email sent to ${email}`,
      status,
      ...(process.env.NODE_ENV !== 'production' && info?.message ? { preview: String(info.message) } : {})
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
