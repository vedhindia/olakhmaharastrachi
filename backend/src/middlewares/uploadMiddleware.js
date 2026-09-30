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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = path.basename(String(file.originalname || 'file')).replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload an image.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB limit
  },
  fileFilter: fileFilter,
});

module.exports = upload;
