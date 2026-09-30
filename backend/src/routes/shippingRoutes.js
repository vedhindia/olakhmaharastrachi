const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shippingController');
const authMiddleware = require('../middlewares/authMiddleware');
const cartAuthMiddleware = require('../middlewares/cartAuthMiddleware');

router.post('/quote', cartAuthMiddleware, shippingController.quoteForCheckout);
router.post('/admin/:orderId/create', authMiddleware, shippingController.createShipment);
router.post('/admin/:orderId/calculate', authMiddleware, shippingController.calculateBorzoPriceByOrder);
router.get('/admin/track/:tracking', authMiddleware, shippingController.getShipment);
router.get('/admin/by-order/:orderId', authMiddleware, shippingController.listByOrder);
router.post('/admin/borzo/:orderId/retry', authMiddleware, shippingController.retryBorzoCreateByOrder);
router.post('/admin/borzo/:orderId/refresh', authMiddleware, shippingController.refreshBorzoStatusByOrder);
router.get('/webhook', (req, res) => res.status(200).json({ ok: true }));
router.post('/webhook', shippingController.webhook);

module.exports = router;
