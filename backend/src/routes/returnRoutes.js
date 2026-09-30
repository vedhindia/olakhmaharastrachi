const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const cartAuthMiddleware = require('../middlewares/cartAuthMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
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

const photoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = path.basename(String(file.originalname || 'file')).replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const photoFileFilter = (req, file, cb) => {
  const mime = String(file?.mimetype || '');
  const allowed = mime.startsWith('image/') || mime === 'application/pdf';
  if (allowed) return cb(null, true);
  const err = new Error('Unsupported file type. Please upload images or PDF.');
  err.status = 400;
  return cb(err, false);
};

const uploadReturnPhotos = multer({
  storage: photoStorage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: photoFileFilter,
});

router.post('/', cartAuthMiddleware, uploadReturnPhotos.array('photos', 5), returnController.createReturnRequest);
router.get('/my', cartAuthMiddleware, returnController.getMyReturnRequests);

router.get('/admin', authMiddleware, returnController.getAdminReturnRequests);
router.put('/admin/:id/status', authMiddleware, returnController.updateReturnRequestStatusAdmin);
router.post('/admin/:id/email', authMiddleware, returnController.emailReturnCustomerAdmin);

module.exports = router;
