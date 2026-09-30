const express = require('express');
const router = express.Router();
const wholesalerController = require('../controllers/wholesalerController');
const wholesalerMiddleware = require('../middlewares/wholesalerMiddleware');
const authMiddleware = require('../middlewares/authMiddleware'); // Admin middleware
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

// --- Wholesaler Personal Routes ---

/**
 * @swagger
 * /api/wholesalers/profile:
 *   get:
 *     summary: Get current wholesaler profile
 *     tags: [Wholesaler]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wholesaler profile
 */
router.get('/profile', wholesalerMiddleware, wholesalerController.getProfile);

/**
 * @swagger
 * /api/wholesalers/profile:
 *   put:
 *     summary: Update wholesaler profile
 *     tags: [Wholesaler]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               business_name:
 *                 type: string
 *               gst_number:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', wholesalerMiddleware, wholesalerController.updateProfile);
router.post(
  '/profile/documents',
  wholesalerMiddleware,
  uploadWholesalerDocuments.array('documents', 10),
  wholesalerController.uploadDocuments
);

// --- Admin Routes ---

/**
 * @swagger
 * /api/wholesalers:
 *   get:
 *     summary: List all wholesalers (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of wholesalers
 */
router.get('/', authMiddleware, wholesalerController.getAllWholesalers);
router.get('/admin/export', authMiddleware, wholesalerController.exportWholesalersCsv);

/**
 * @swagger
 * /api/wholesalers/{id}/status:
 *   put:
 *     summary: Update wholesaler status (Approve/Reject)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, blocked, pending]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:id/status', authMiddleware, wholesalerController.updateWholesalerStatus);
router.post('/:id/notify-status', authMiddleware, wholesalerController.sendWholesalerStatusNotification);
router.delete('/:id', authMiddleware, wholesalerController.deleteWholesaler);

module.exports = router;
