const { CommunicationLog } = require('../models');
const { Op, Sequelize } = require('sequelize');
const nodemailer = require('nodemailer');

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

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
const safeJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return {};
};

exports.getAdminLogs = async (req, res) => {
  try {
    const { entityType, entityId, channel, status, from, to, source, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (entityType) where.entity_type = entityType;
    if (entityId) where.entity_id = entityId;
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (source) {
      const jsonSource = Sequelize.literal("JSON_UNQUOTE(JSON_EXTRACT(meta, '$.source'))");
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push(Sequelize.where(jsonSource, String(source)));
    }
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const { count, rows } = await CommunicationLog.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      logs: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.createAdminLog = async (req, res) => {
  try {
    const { entity_type, entity_id, channel, subject, message, status, meta } = req.body;
    if (!entity_type || !entity_id || !channel) {
      return res.status(400).json({ message: 'entity_type, entity_id, channel are required' });
    }
    const log = await CommunicationLog.create({
      entity_type,
      entity_id,
      channel,
      subject: subject || null,
      message: message || null,
      status: status || 'sent',
      meta: meta || null
    });
    res.status(201).json({ message: 'Log created', log });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.submitContactForm = async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'name, email and message are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }

  const safeName = name.slice(0, 100);
  const safeEmail = email.slice(0, 200);
  const safeSubject = subject.slice(0, 200);
  const safeMessage = message.slice(0, 5000);

  const toEmail = process.env.CONTACT_TO_EMAIL || process.env.ADMIN_EMAIL || process.env.MAIL_USER;
  if (!toEmail) {
    return res.status(500).json({ message: 'Contact email is not configured' });
  }

  const transport = createEmailTransport();
  const fromEmail =
    process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || process.env.MAIL_USER || 'no-reply@ecommerce-ashoka.local';

  const emailSubject = safeSubject ? `Contact: ${safeSubject}` : 'New contact form enquiry';
  const bodyText = [
    'New enquiry from Ashoka website contact form',
    '',
    `Name: ${safeName}`,
    `Email: ${safeEmail}`,
    safeSubject ? `Subject: ${safeSubject}` : null,
    '',
    'Message:',
    safeMessage,
    '',
    `IP: ${req.ip || '-'}`,
    `User-Agent: ${req.get('user-agent') || '-'}`,
  ]
    .filter(Boolean)
    .join('\n');

  let status = 'sent';
  let sendError = null;
  try {
    await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: safeEmail,
      subject: emailSubject,
      text: bodyText,
    });
  } catch (err) {
    status = 'failed';
    sendError = err?.message || 'Failed to send email';
  }

  try {
    await CommunicationLog.create({
      entity_type: 'user',
      entity_id: 0,
      channel: 'email',
      subject: emailSubject,
      message: bodyText,
      status,
      meta: {
        source: 'contact_form',
        name: safeName,
        email: safeEmail,
        rawSubject: safeSubject || null,
        ip: req.ip || null,
        userAgent: req.get('user-agent') || null,
        error: sendError,
      },
    });
  } catch {}

  if (status !== 'sent') {
    return res.status(500).json({ message: sendError || 'Failed to send enquiry' });
  }

  return res.status(200).json({ message: 'Enquiry sent successfully' });
};

exports.updateAdminLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await CommunicationLog.findByPk(id);
    if (!log) return res.status(404).json({ message: 'Inquiry not found' });

    const meta = safeJsonObject(log.meta);
    if (meta.source !== 'contact_form') {
      return res.status(400).json({ message: 'Only contact form inquiries can be edited' });
    }

    const subject = req.body?.subject != null ? String(req.body.subject).trim().slice(0, 255) : undefined;
    const message = req.body?.message != null ? String(req.body.message).trim() : undefined;
    if (subject !== undefined) log.subject = subject || null;
    if (message !== undefined) log.message = message || null;

    log.meta = {
      ...meta,
      edited_at: new Date().toISOString(),
      edited_by_admin_id: req.admin?.id || null,
    };
    await log.save();

    return res.status(200).json({ message: 'Inquiry updated', log });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteAdminLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await CommunicationLog.findByPk(id);
    if (!log) return res.status(404).json({ message: 'Inquiry not found' });

    const meta = safeJsonObject(log.meta);
    if (meta.source !== 'contact_form') {
      return res.status(400).json({ message: 'Only contact form inquiries can be deleted' });
    }

    await log.destroy();
    return res.status(200).json({ message: 'Inquiry deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.replyToInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const inquiry = await CommunicationLog.findByPk(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    const meta = safeJsonObject(inquiry.meta);
    if (meta.source !== 'contact_form') {
      return res.status(400).json({ message: 'Only contact form inquiries can be replied to' });
    }

    const toEmail = String(meta.email || '').trim();
    if (!isValidEmail(toEmail)) {
      return res.status(400).json({ message: 'Customer email is missing or invalid for this inquiry' });
    }

    const subjectRaw = String(req.body?.subject || '').trim();
    const messageRaw = String(req.body?.message || '').trim();
    if (!messageRaw) {
      return res.status(400).json({ message: 'Reply message is required' });
    }

    const subject = (subjectRaw || `Re: ${inquiry.subject || 'Your enquiry'}`).slice(0, 255);
    const message = messageRaw.slice(0, 8000);

    const transport = createEmailTransport();
    const fromEmail =
      process.env.FROM_EMAIL || process.env.ADMIN_EMAIL || process.env.MAIL_USER || 'no-reply@ecommerce-ashoka.local';
    const replyToEmail = process.env.CONTACT_TO_EMAIL || process.env.ADMIN_EMAIL || process.env.MAIL_USER || fromEmail;

    let status = 'sent';
    let sendError = null;
    try {
      await transport.sendMail({
        from: fromEmail,
        to: toEmail,
        replyTo: replyToEmail,
        subject,
        text: message,
      });
    } catch (err) {
      status = 'failed';
      sendError = err?.message || 'Failed to send email';
    }

    try {
      await CommunicationLog.create({
        entity_type: 'user',
        entity_id: 0,
        channel: 'email',
        subject,
        message,
        status,
        meta: {
          source: 'inquiry_reply',
          in_reply_to: inquiry.id,
          to: toEmail,
          admin_id: req.admin?.id || null,
          error: sendError,
        },
      });
    } catch {}

    inquiry.meta = {
      ...meta,
      replied_at: status === 'sent' ? new Date().toISOString() : meta.replied_at || null,
      last_reply_status: status,
      last_reply_error: sendError,
      last_replied_by_admin_id: req.admin?.id || null,
    };
    await inquiry.save().catch(() => {});

    if (status !== 'sent') {
      return res.status(500).json({ message: sendError || 'Failed to send reply' });
    }

    return res.status(200).json({ message: 'Reply sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
