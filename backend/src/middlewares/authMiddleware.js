const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models');

module.exports = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await AdminUser.findByPk(decoded.id);

    if (!admin) {
      return res.status(401).json({ message: 'Token is invalid' });
    }

    const envEmail = String(process.env.PRIMARY_ADMIN_EMAIL || '').trim();
    const primary = envEmail
      ? await AdminUser.findOne({ attributes: ['id'], where: { email: envEmail } })
      : await AdminUser.findOne({ attributes: ['id'], order: [['id', 'ASC']] });
    if (primary && admin.id !== primary.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!admin.status) {
        return res.status(403).json({ message: 'Account is inactive' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
