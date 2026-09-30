const { Shipment, Order, User, Wholesaler } = require('../models');
const {
  createBorzoDeliveryOrder,
  calculateBorzoOrder,
  fetchBorzoOrder,
  mapBorzoStatusToShipmentStatus,
} = require('../utils/borzoService');

const extractBorzoStatus = (data) =>
  data?.order?.status ??
  data?.order?.delivery?.status ??
  data?.delivery?.status ??
  data?.status ??
  null;

const parseNonNegativeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
};

const getShippingMargin = () => {
  const percent = parseNonNegativeNumber(process.env.BORZO_SHIPPING_MARGIN_PERCENT);
  const flat = parseNonNegativeNumber(process.env.BORZO_SHIPPING_MARGIN_FLAT);
  return { percent, flat };
};

exports.quoteForCheckout = async (req, res) => {
  try {
    const shipping_address = String(req.body?.shipping_address || '').trim();
    if (!shipping_address) {
      return res.status(400).json({ message: 'shipping_address is required' });
    }

    const dropoffPhone = req.body?.phone || req.body?.billing_phone || req.user?.phone || null;
    if (!dropoffPhone) {
      return res.status(400).json({ message: 'Phone number is required to calculate shipping' });
    }

    const dropoffName =
      req.body?.name ||
      req.user?.business_name ||
      req.user?.name ||
      null;

    const quote = await calculateBorzoOrder({
      orderId: null,
      dropoff: {
        address: shipping_address,
        name: dropoffName,
        phone: dropoffPhone,
      },
      matter: 'Ashoka checkout quote',
    });

    const basePrice = parseNonNegativeNumber(quote.price);
    const { percent, flat } = getShippingMargin();
    const marginAmount = basePrice * (percent / 100) + flat;
    const shippingFee = Math.max(0, basePrice + marginAmount);

    res.status(200).json({
      shipping_fee: Number(shippingFee.toFixed(2)),
      base_price: Number(basePrice.toFixed(2)),
      margin: {
        percent: Number(percent.toFixed(2)),
        flat: Number(flat.toFixed(2)),
        amount: Number(marginAmount.toFixed(2)),
      },
      raw: quote.raw,
    });
  } catch (error) {
    const details = error?.details?.data || null;
    const borzoErrors = Array.isArray(details?.errors)
      ? details.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
      : null;
    const paramErrorsRaw = details?.parameter_errors || details?.param_errors || null;
    const paramErrors = paramErrorsRaw ? JSON.stringify(paramErrorsRaw) : '';
    const message =
      borzoErrors && borzoErrors.length > 0
        ? `Borzo error: ${borzoErrors.join(', ')}${paramErrors ? ` | parameter_errors: ${paramErrors}` : ''}`
        : error?.message || 'Server error';
    const statusCode =
      error?.code === 'BORZO_TOKEN_MISSING' || error?.code === 'BORZO_WAREHOUSE_ADDRESS_MISSING'
        ? 500
        : 400;
    res.status(statusCode).json({ message });
  }
};

exports.createShipment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'customer', attributes: ['name', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['name', 'business_name', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot create shipment for cancelled order' });
    }

    const existing = await Shipment.findOne({
      where: { order_id: order.id, carrier: 'BORZO' },
      order: [['created_at', 'DESC']],
    });
    if (existing?.tracking_number) {
      if (order.status !== 'shipped' && order.status !== 'delivered') {
        order.status = 'shipped';
        await order.save();
      }
      return res.status(201).json({ tracking_number: existing.tracking_number, status: existing.status });
    }

    if (!order.shipping_address) {
      return res.status(400).json({ message: 'Order shipping address is missing' });
    }

    const customerName =
      order.wholesaler?.business_name ||
      order.wholesaler?.name ||
      order.customer?.name ||
      null;
    const customerPhone = order.wholesaler?.phone || order.customer?.phone || null;

    let quote = null;
    try {
      quote = await calculateBorzoOrder({
        orderId: order.id,
        dropoff: {
          address: String(order.shipping_address),
          name: customerName,
          phone: customerPhone,
        },
        matter: `Ashoka order #${order.id}`,
      });
    } catch (e) {
      quote = null;
    }

    const { courierOrderId, raw } = await createBorzoDeliveryOrder({
      orderId: order.id,
      dropoff: {
        address: String(order.shipping_address),
        name: customerName,
        phone: customerPhone,
      },
      matter: `Ashoka order #${order.id}`,
    });

    const shipment = await Shipment.create({
      order_id: order.id,
      tracking_number: String(courierOrderId),
      carrier: 'BORZO',
      status: 'created',
      last_event: JSON.stringify({
        action: 'create-order',
        courier_order_id: String(courierOrderId),
        created_at: new Date().toISOString(),
        quote: quote
          ? {
              price: quote.price,
              borzo_response: quote.raw,
            }
          : null,
        borzo_response: raw,
      }),
    });

    order.status = 'shipped';
    await order.save();
    res.status(201).json({ tracking_number: shipment.tracking_number, status: shipment.status });
  } catch (error) {
    const details = error?.details?.data || null;
    const borzoErrors = Array.isArray(details?.errors) ? details.errors : null;
    const message =
      borzoErrors && borzoErrors.length > 0
        ? `Borzo error: ${borzoErrors.join(', ')}`
        : error?.message || 'Server error';
    const statusCode =
      error?.code === 'BORZO_TOKEN_MISSING' || error?.code === 'BORZO_WAREHOUSE_ADDRESS_MISSING'
        ? 500
        : 400;
    res.status(statusCode).json({ message });
  }
};

exports.getShipment = async (req, res) => {
  try {
    const { tracking } = req.params;
    const shipment = await Shipment.findOne({ where: { tracking_number: tracking } });
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    if ((shipment.carrier || '').toUpperCase() === 'BORZO') {
      try {
        const data = await fetchBorzoOrder(shipment.tracking_number);
        const borzoStatus = extractBorzoStatus(data);

        shipment.status = mapBorzoStatusToShipmentStatus(borzoStatus);
        shipment.last_event = JSON.stringify({
          action: 'order',
          borzo_status: borzoStatus,
          fetched_at: new Date().toISOString(),
          borzo_response: data,
        });
        await shipment.save();

        const order = await Order.findByPk(shipment.order_id);
        if (order) {
          if (shipment.status === 'delivered') order.status = 'delivered';
          else if (shipment.status === 'cancelled') order.status = 'cancelled';
          else if (order.status !== 'shipped' && order.status !== 'delivered') order.status = 'shipped';
          await order.save();
        }
      } catch (e) {
        console.error('Borzo get-order error:', e?.details || e);
      }
    }
    res.status(200).json(shipment);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.calculateBorzoPriceByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'customer', attributes: ['name', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['name', 'business_name', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (!order.shipping_address) {
      return res.status(400).json({ message: 'Order shipping address is missing' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot calculate delivery for cancelled order' });
    }

    const customerName =
      order.wholesaler?.business_name ||
      order.wholesaler?.name ||
      order.customer?.name ||
      null;
    const customerPhone = order.wholesaler?.phone || order.customer?.phone || null;

    const quote = await calculateBorzoOrder({
      orderId: order.id,
      dropoff: {
        address: String(order.shipping_address),
        name: customerName,
        phone: customerPhone,
      },
      matter: `Ashoka order #${order.id}`,
    });

    res.status(200).json({
      order_id: order.id,
      price: quote.price,
      raw: quote.raw,
    });
  } catch (error) {
    const details = error?.details?.data || null;
    const borzoErrors = Array.isArray(details?.errors)
      ? details.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
      : null;
    const paramErrorsRaw = details?.parameter_errors || details?.param_errors || null;
    const paramErrors = paramErrorsRaw ? JSON.stringify(paramErrorsRaw) : '';
    const message =
      borzoErrors && borzoErrors.length > 0
        ? `Borzo error: ${borzoErrors.join(', ')}${paramErrors ? ` | parameter_errors: ${paramErrors}` : ''}`
        : error?.message || 'Server error';
    const statusCode =
      error?.code === 'BORZO_TOKEN_MISSING' || error?.code === 'BORZO_WAREHOUSE_ADDRESS_MISSING'
        ? 500
        : 400;
    res.status(statusCode).json({ message });
  }
};

exports.listByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipments = await Shipment.findAll({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']]
    });
    const hasBorzo = shipments.some((s) => String(s.carrier || '').toUpperCase() === 'BORZO');
    const filtered = hasBorzo
      ? shipments.filter((s) => String(s.carrier || '').toUpperCase() === 'BORZO')
      : shipments;
    res.status(200).json({ shipments: filtered });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.webhook = async (req, res) => {
  try {
    const tracking_number =
      req.body?.tracking_number ??
      req.body?.order_id ??
      req.body?.order?.order_id ??
      req.body?.order?.id ??
      req.body?.delivery?.order_id ??
      req.body?.delivery?.id ??
      null;

    const statusRaw =
      req.body?.status ??
      req.body?.order?.status ??
      req.body?.order?.delivery?.status ??
      req.body?.delivery?.status ??
      null;

    if (!tracking_number || !statusRaw) {
      return res.status(400).json({ message: 'tracking_number (or order_id) and status are required' });
    }

    const shipment = await Shipment.findOne({ where: { tracking_number: String(tracking_number) } });
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    const normalizedStatus = mapBorzoStatusToShipmentStatus(statusRaw);
    shipment.status = normalizedStatus;
    shipment.last_event = JSON.stringify({
      action: 'webhook',
      received_at: new Date().toISOString(),
      borzo_status: statusRaw,
      payload: req.body,
    });
    await shipment.save();
    const order = await Order.findByPk(shipment.order_id);
    if (order) {
      if (normalizedStatus === 'delivered') order.status = 'delivered';
      else if (normalizedStatus === 'cancelled') order.status = 'cancelled';
      else order.status = 'shipped';
      await order.save();
    }
    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.refreshBorzoStatusByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipment = await Shipment.findOne({
      where: { order_id: orderId, carrier: 'BORZO' },
      order: [['created_at', 'DESC']],
    });
    if (!shipment) {
      return res.status(404).json({ message: 'Borzo shipment not found for this order' });
    }

    const data = await fetchBorzoOrder(shipment.tracking_number);
    const borzoStatus = extractBorzoStatus(data);

    shipment.status = mapBorzoStatusToShipmentStatus(borzoStatus);
    shipment.last_event = JSON.stringify({
      action: 'order',
      borzo_status: borzoStatus,
      fetched_at: new Date().toISOString(),
      borzo_response: data,
    });
    await shipment.save();

    const order = await Order.findByPk(shipment.order_id);
    if (order) {
      if (shipment.status === 'delivered') order.status = 'delivered';
      else if (shipment.status === 'cancelled') order.status = 'cancelled';
      else if (order.status !== 'shipped' && order.status !== 'delivered') order.status = 'shipped';
      await order.save();
    }

    res.status(200).json({
      order_id: shipment.order_id,
      courier_order_id: shipment.tracking_number,
      courier_status: shipment.status,
    });
  } catch (error) {
    console.error('Borzo refresh status error:', error?.details || error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.retryBorzoCreateByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'customer', attributes: ['name', 'phone'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['name', 'business_name', 'phone'] },
      ],
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (!order.shipping_address) {
      return res.status(400).json({ message: 'Order shipping address is missing' });
    }

    const customerName =
      order.wholesaler?.business_name ||
      order.wholesaler?.name ||
      order.customer?.name ||
      null;
    const customerPhone = order.wholesaler?.phone || order.customer?.phone || null;

    const { courierOrderId, raw } = await createBorzoDeliveryOrder({
      orderId: order.id,
      dropoff: {
        address: String(order.shipping_address),
        name: customerName,
        phone: customerPhone,
      },
      matter: `Ashoka order #${order.id}`,
    });

    const lastEvent = JSON.stringify({
      action: 'create-order',
      courier_order_id: courierOrderId,
      retried_at: new Date().toISOString(),
      borzo_response: raw,
    });

    const existing = await Shipment.findOne({
      where: { order_id: order.id, carrier: 'BORZO' },
      order: [['created_at', 'DESC']],
    });

    if (existing) {
      existing.tracking_number = courierOrderId;
      existing.status = 'created';
      existing.last_event = lastEvent;
      await existing.save();
    } else {
      await Shipment.create({
        order_id: order.id,
        tracking_number: courierOrderId,
        carrier: 'BORZO',
        status: 'created',
        last_event: lastEvent,
      });
    }

    if (order.status !== 'shipped' && order.status !== 'delivered') {
      order.status = 'shipped';
      await order.save();
    }

    res.status(200).json({
      order_id: order.id,
      courier_order_id: courierOrderId,
      courier_status: 'created',
    });
  } catch (error) {
    console.error('Borzo retry create error:', error?.details || error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
