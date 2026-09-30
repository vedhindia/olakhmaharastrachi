const express = require('express');
const router = express.Router();
const wholesalerAuthController = require('../controllers/wholesalerAuthController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const persistentUploadsDir = process.platform !== 'win32' ? '/var/lib/ashoka_uploads' : null;
const repoUploadsDir = path.resolve(__dirname, '../../../uploads');
const defaultUploadsDir =
  process.env.NODE_ENV === 'production' && persistentUploadsDir ? persistentUploadsDir : repoUploadsDir;
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : defaultUploadsDir;

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = path.basename(String(file.originalname || 'file')).replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeOriginal}`);
  }
});

const documentFileFilter = (req, file, cb) => {
  const mime = String(file?.mimetype || '');
  const allowed =
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (allowed) return cb(null, true);
  const err = new Error('Unsupported file type. Please upload images, PDF, DOC, or DOCX.');
  err.status = 400;
  return cb(err, false);
};

const uploadWholesalerDocuments = multer({
  storage: documentStorage,
  limits: { fileSize: 1024 * 1024 * 10 },
  fileFilter: documentFileFilter
});

/**
 * @swagger
 * /api/wholesaler-auth/send-otp:
 *   post:
 *     summary: Send OTP for login/registration
 *     tags: [Wholesaler]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/send-otp', wholesalerAuthController.sendOtp);

/**
 * @swagger
 * /api/wholesaler-auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login/register
 *     tags: [Wholesaler]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/verify-otp', uploadWholesalerDocuments.array('documents', 10), wholesalerAuthController.verifyOtp);

module.exports = router;
