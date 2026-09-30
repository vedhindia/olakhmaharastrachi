const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const sequelize = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userAuthRoutes = require('./routes/userAuthRoutes');
const userRoutes = require('./routes/userRoutes');
const wholesalerAuthRoutes = require('./routes/wholesalerAuthRoutes');
const wholesalerRoutes = require('./routes/wholesalerRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const couponRoutes = require('./routes/couponRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const communicationsRoutes = require('./routes/communicationsRoutes');
const returnRoutes = require('./routes/returnRoutes');
const communicationsController = require('./controllers/communicationsController');

const path = require('path');
const fs = require('fs');

const app = express();
app.enable('trust proxy'); // Fix for Nginx/Cloudflare redirect loops
app.locals.dbReady = false;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/uploads', express.static('/var/lib/ashoka_uploads'));

const backendUploadsDir = path.join(__dirname, '../uploads');
const rootUploadsDir = path.join(__dirname, '../../uploads');
const cwdUploadsDir = path.join(process.cwd(), 'uploads');
const envUploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : null;
const linuxSymlinkUploadsDir =
  process.platform !== 'win32' && fs.existsSync('/var/www/ashoka_web/uploads')
    ? '/var/www/ashoka_web/uploads'
    : null;
const linuxPersistentUploadsDir =
  process.platform !== 'win32' && fs.existsSync('/var/lib/ashoka_uploads') ? '/var/lib/ashoka_uploads' : null;
const uploadDirs = Array.from(
  new Set(
    [envUploadsDir, linuxSymlinkUploadsDir, linuxPersistentUploadsDir, backendUploadsDir, rootUploadsDir, cwdUploadsDir]
      .filter(Boolean)
  )
);

uploadDirs.forEach((dir) => {
  app.use('/uploads', express.static(dir));
  app.use('/api/uploads', express.static(dir));
});

// Fallback for missing images (if static middleware didn't find it)
app.use(['/api/uploads', '/uploads'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).end();
});

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, dbReady: Boolean(app.locals.dbReady) });
});

app.get('/api/version', (req, res) => {
  res.json({ version: '1.1.1', fix: 'deployment-force-retry', deployed: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('Ashoka Backend Running');
});

app.get('/api', (req, res) => {
  res.send('Ashoka API Running');
});

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/uploads')) return next();
  if (req.path === '/health') return next();
  if (req.path.startsWith('/docs')) return next();
  if (!app.locals.dbReady) {
    return res.status(503).json({ message: 'Service unavailable: database not connected' });
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/user-auth', userAuthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wholesaler-auth', wholesalerAuthRoutes);
app.use('/api/wholesalers', wholesalerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/returns', returnRoutes);
app.post('/api/contact', communicationsController.submitContactForm);

// Dual-mount key public routes without the /api prefix to tolerate Nginx configs
// that strip or retain the /api prefix. Auth-protected endpoints remain protected.
app.use('/products', productRoutes);
app.use('/categories', categoryRoutes);
app.use('/reviews', reviewRoutes);
app.use('/shipping', shippingRoutes);

// Swagger Config
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ecommerce Ashoka Backend API',
      version: '1.0.0',
      description: 'API documentation for Ecommerce Ashoka Backend Admin Panel',
    },
    tags: [
      { name: 'Admin', description: 'Admin authentication, management, and dashboard' },
      { name: 'User', description: 'Customer authentication and profile' },
      { name: 'Wholesaler', description: 'Wholesaler authentication and profile' },
      { name: 'Payment', description: 'Payment Gateway Integration (Razorpay)' },
    ],
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Global 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "API endpoint not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = app;
