const https = require('https');

const getBorzoConfig = () => {
  const baseUrlRaw =
    process.env.BORZO_BASE_URL || 'https://robotapitest-in.borzodelivery.com/api/business/1.6';
  const baseUrl = String(baseUrlRaw || '')
    .trim()
    .replace(/^['"`]\s*/, '')
    .replace(/\s*['"`]$/, '');
  const authToken = process.env.BORZO_AUTH_TOKEN || process.env.BORZO_TOKEN || '';

  const warehouseAddress = process.env.BORZO_WAREHOUSE_ADDRESS || '';
  const warehouseName = process.env.BORZO_WAREHOUSE_NAME || 'Warehouse';
  const warehousePhone = process.env.BORZO_WAREHOUSE_PHONE || '';
  const callbackUrlRaw = process.env.BORZO_CALLBACK_URL || process.env.BORZO_WEBHOOK_URL || '';
  const callbackUrl = String(callbackUrlRaw || '')
    .trim()
    .replace(/^['"`]\s*/, '')
    .replace(/\s*['"`]$/, '');
  const sendCallbackUrl = String(process.env.BORZO_SEND_CALLBACK_URL || '')
    .trim()
    .toLowerCase() === 'true';

  const vehicleTypeIdRaw = process.env.BORZO_VEHICLE_TYPE_ID || '8';
  const vehicleTypeId = Number(vehicleTypeIdRaw);

  const defaultCountryCode = String(process.env.BORZO_DEFAULT_COUNTRY_CODE || '91').replace(
    /\D/g,
    '',
  );

  return {
    baseUrl,
    authToken,
    warehouseAddress,
    warehouseName,
    warehousePhone,
    callbackUrl,
    sendCallbackUrl,
    vehicleTypeId: Number.isFinite(vehicleTypeId) ? vehicleTypeId : 8,
    defaultCountryCode: defaultCountryCode || '91',
  };
};

const normalizePhoneForBorzo = (rawPhone, defaultCountryCode) => {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
};

const borzoRequest = async ({ method, path, body }) => {
  const { baseUrl, authToken } = getBorzoConfig();
  if (!authToken) {
    const err = new Error('BORZO_AUTH_TOKEN is missing');
    err.code = 'BORZO_TOKEN_MISSING';
    throw err;
  }

  const url = new URL(baseUrl.replace(/\/+$/, '') + path);
  const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ashoka-backend/borzo',
    Authorization: `Bearer ${authToken}`,
    'X-DV-Auth-Token': authToken,
  };

  if (payload) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['Content-Length'] = String(payload.length);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers,
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = rawText ? JSON.parse(rawText) : null;
          } catch (e) {
            data = { raw: rawText };
          }
          resolve({ statusCode: res.statusCode || 0, data });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Borzo request timeout'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

const createBorzoDeliveryOrder = async ({ orderId, pickup, dropoff, matter }) => {
  const {
    warehouseAddress,
    warehouseName,
    warehousePhone,
    defaultCountryCode,
    vehicleTypeId,
    callbackUrl,
    sendCallbackUrl,
  } =
    getBorzoConfig();

  const pickupAddress = pickup?.address || warehouseAddress;
  const pickupName = pickup?.name || warehouseName;
  const pickupPhoneRaw = pickup?.phone || warehousePhone;

  if (!pickupAddress) {
    const err = new Error('BORZO_WAREHOUSE_ADDRESS is missing');
    err.code = 'BORZO_WAREHOUSE_ADDRESS_MISSING';
    throw err;
  }

  const pickupPhone = normalizePhoneForBorzo(pickupPhoneRaw, defaultCountryCode);
  const dropoffPhone = normalizePhoneForBorzo(dropoff?.phone, defaultCountryCode);
  if (!pickupPhone) {
    const err = new Error('BORZO_WAREHOUSE_PHONE is missing');
    err.code = 'BORZO_WAREHOUSE_PHONE_MISSING';
    throw err;
  }
  if (!dropoffPhone) {
    const err = new Error('Customer phone is missing for Borzo delivery');
    err.code = 'BORZO_DROPOFF_PHONE_MISSING';
    throw err;
  }

  const payload = {
    type: 'standard',
    matter: matter || `Order #${orderId}`,
    vehicle_type_id: vehicleTypeId,
    is_contact_person_notification_enabled: true,
    ...(sendCallbackUrl && callbackUrl ? { callback_url: callbackUrl } : {}),
    points: [
      {
        address: pickupAddress,
        contact_person: {
          name: pickupName,
          phone: pickupPhone,
        },
      },
      {
        address: dropoff.address,
        contact_person: {
          name: dropoff.name || null,
          phone: dropoffPhone,
        },
        client_order_id: String(orderId).slice(0, 32),
      },
    ],
  };

  const { statusCode, data } = await borzoRequest({
    method: 'POST',
    path: '/create-order',
    body: payload,
  });

  if (statusCode !== 200 || !data || data.is_successful !== true) {
    const err = new Error('Borzo create-order failed');
    err.code = 'BORZO_CREATE_FAILED';
    err.details = { statusCode, data };
    throw err;
  }

  const courierOrderId =
    data?.order?.order_id ?? data?.order_id ?? data?.courier_order_id ?? data?.order?.id ?? null;

  if (!courierOrderId) {
    const err = new Error('Borzo create-order did not return order_id');
    err.code = 'BORZO_ORDER_ID_MISSING';
    err.details = { statusCode, data };
    throw err;
  }

  return { courierOrderId: String(courierOrderId), raw: data };
};

const calculateBorzoOrder = async ({ orderId, pickup, dropoff, matter }) => {
  const {
    warehouseAddress,
    warehouseName,
    warehousePhone,
    defaultCountryCode,
    vehicleTypeId,
  } = getBorzoConfig();

  const pickupAddress = pickup?.address || warehouseAddress;
  const pickupName = pickup?.name || warehouseName;
  const pickupPhoneRaw = pickup?.phone || warehousePhone;

  if (!pickupAddress) {
    const err = new Error('BORZO_WAREHOUSE_ADDRESS is missing');
    err.code = 'BORZO_WAREHOUSE_ADDRESS_MISSING';
    throw err;
  }

  const pickupPhone = normalizePhoneForBorzo(pickupPhoneRaw, defaultCountryCode);
  const dropoffPhone = normalizePhoneForBorzo(dropoff?.phone, defaultCountryCode);
  if (!pickupPhone) {
    const err = new Error('BORZO_WAREHOUSE_PHONE is missing');
    err.code = 'BORZO_WAREHOUSE_PHONE_MISSING';
    throw err;
  }
  if (!dropoffPhone) {
    const err = new Error('Customer phone is missing for Borzo delivery');
    err.code = 'BORZO_DROPOFF_PHONE_MISSING';
    throw err;
  }

  const payload = {
    type: 'standard',
    matter: matter || (orderId ? `Order #${orderId}` : 'Order'),
    vehicle_type_id: vehicleTypeId,
    points: [
      {
        address: pickupAddress,
        contact_person: {
          name: pickupName,
          phone: pickupPhone,
        },
      },
      {
        address: dropoff.address,
        contact_person: {
          name: dropoff.name || null,
          phone: dropoffPhone,
        },
        ...(orderId ? { client_order_id: String(orderId).slice(0, 32) } : {}),
      },
    ],
  };

  const { statusCode, data } = await borzoRequest({
    method: 'POST',
    path: '/calculate-order',
    body: payload,
  });

  if (statusCode !== 200 || !data || data.is_successful !== true) {
    const err = new Error('Borzo calculate-order failed');
    err.code = 'BORZO_CALCULATE_FAILED';
    err.details = { statusCode, data };
    throw err;
  }

  const price =
    data?.order?.payment_amount ??
    data?.order?.price ??
    data?.price ??
    data?.payment_amount ??
    null;

  return {
    price: price === null ? null : Number(price),
    raw: data,
  };
};

const fetchBorzoOrder = async (courierOrderId) => {
  const body = { order_id: Number(courierOrderId) };

  const normalizeOrdersResponse = (data) => {
    if (!data) return data;
    const orderFromList = Array.isArray(data.orders) ? data.orders[0] : null;
    if (orderFromList && !data.order) {
      return { ...data, order: orderFromList };
    }
    return data;
  };

  const errorsIncludeInvalidMethod = (data) =>
    Array.isArray(data?.errors) && data.errors.some((e) => String(e || '').toLowerCase() === 'invalid_api_method');

  const attempts = [
    () =>
      borzoRequest({
        method: 'GET',
        path: `/orders?order_id=${encodeURIComponent(courierOrderId)}`,
      }),
    () =>
      borzoRequest({
        method: 'GET',
        path: `/orders/${encodeURIComponent(courierOrderId)}`,
      }),
    () =>
      borzoRequest({
        method: 'POST',
        path: '/orders',
        body,
      }),
    () =>
      borzoRequest({
        method: 'POST',
        path: '/order',
        body,
      }),
    () =>
      borzoRequest({
        method: 'GET',
        path: `/order?order_id=${encodeURIComponent(courierOrderId)}`,
      }),
    () =>
      borzoRequest({
        method: 'POST',
        path: '/get-order',
        body,
      }),
    () =>
      borzoRequest({
        method: 'GET',
        path: `/get-order?order_id=${encodeURIComponent(courierOrderId)}`,
      }),
  ];

  let lastResult = null;
  for (const attempt of attempts) {
    let result = null;
    try {
      result = await attempt();
    } catch (e) {
      result = null;
    }

    if (!result) continue;

    const { statusCode, data } = result;
    const normalized = normalizeOrdersResponse(data);

    if (statusCode === 200 && normalized && normalized.is_successful === true) {
      return normalized;
    }

    lastResult = { statusCode, data: normalized };
    if (!errorsIncludeInvalidMethod(normalized)) {
      break;
    }
  }

  const err = new Error('Borzo order fetch failed');
  err.code = 'BORZO_ORDER_FETCH_FAILED';
  err.details = lastResult || { statusCode: 0, data: null };
  throw err;
};

const cancelBorzoOrder = async (courierOrderId) => {
  const orderIdNum = Number(courierOrderId);
  const body = { order_id: Number.isFinite(orderIdNum) ? orderIdNum : courierOrderId };

  let result = null;
  try {
    result = await borzoRequest({ method: 'POST', path: '/cancel-order', body });
  } catch (e) {
    result = null;
  }

  if (!result || (result.statusCode !== 200 && result.statusCode !== 400)) {
    result = await borzoRequest({
      method: 'GET',
      path: `/cancel-order?order_id=${encodeURIComponent(courierOrderId)}`,
    });
  }

  const { statusCode, data } = result;
  if (statusCode !== 200 || !data || data.is_successful !== true) {
    const err = new Error('Borzo cancel-order failed');
    err.code = 'BORZO_CANCEL_FAILED';
    err.details = { statusCode, data };
    throw err;
  }

  return data;
};

const mapBorzoStatusToShipmentStatus = (borzoStatus) => {
  const s = String(borzoStatus || '').toLowerCase();
  if (!s) return 'created';
  if (['delivered', 'done', 'completed', 'finished'].includes(s)) return 'delivered';
  if (['cancelled', 'canceled', 'cancel'].includes(s)) return 'cancelled';
  if (
    [
      'new',
      'available',
      'active',
      'delayed',
      'picking_up',
      'picked_up',
      'in_transit',
      'arrived',
      'delivering',
    ].includes(s)
  )
    return 'in_transit';
  return 'created';
};

module.exports = {
  getBorzoConfig,
  createBorzoDeliveryOrder,
  calculateBorzoOrder,
  fetchBorzoOrder,
  cancelBorzoOrder,
  mapBorzoStatusToShipmentStatus,
};
