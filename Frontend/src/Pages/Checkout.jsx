import { useCallback, useEffect, useState } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import './Checkout.css';

const API_BASE = '/api';

const getAuthToken = () => {
  if (typeof localStorage === 'undefined') return null;
  const userToken = localStorage.getItem('userToken');
  if (userToken) return userToken;
  const wholesalerToken = localStorage.getItem('wholesalerToken');
  if (wholesalerToken) return wholesalerToken;
  return null;
};

const splitFullName = (value) => {
  const parts = String(value || '')
    .trim()
    .split(' ')
    .filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' ') || '',
  };
};

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'cart';
  const quantityParam = searchParams.get('qty');
  const isInstant = mode === 'instant';
  const [cart, setCart] = useState(null);
  const [instantItem, setInstantItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [country, setCountry] = useState('India');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponSummary, setCouponSummary] = useState(null);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [customerTypeLabel, setCustomerTypeLabel] = useState('Retail Customer');
  const [shippingFee, setShippingFee] = useState(0);
  const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
  const [shippingQuoteError, setShippingQuoteError] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [shipDifferentAddress, setShipDifferentAddress] = useState(false);
  const [profileDefaults, setProfileDefaults] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    address1: '',
    address2: '',
    city: '',
    stateName: '',
    postcode: '',
    billingEmail: '',
    billingPhone: '',
  });
  const [appliedProfileDefaults, setAppliedProfileDefaults] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    address1: '',
    address2: '',
    city: '',
    stateName: '',
    postcode: '',
    billingEmail: '',
    billingPhone: '',
  });

  const clearPersistedCoupon = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('appliedCouponCode');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('appliedCouponCode');
    }
  };

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const flash = sessionStorage.getItem('checkoutFlash');
    if (flash) {
      try {
        const parsed = JSON.parse(flash);
        if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
          setMessage(parsed.message);
        }
      } catch (err) {
        void err;
      } finally {
        sessionStorage.removeItem('checkoutFlash');
      }
    }
    const draft = sessionStorage.getItem('checkoutDraft');
    if (!draft) return;
    try {
      const parsed = JSON.parse(draft);
      if (parsed && typeof parsed === 'object') {
        setFirstName((prev) => prev || parsed.firstName || '');
        setLastName((prev) => prev || parsed.lastName || '');
        setCompanyName((prev) => prev || parsed.companyName || '');
        setAddress1((prev) => prev || parsed.address1 || '');
        setAddress2((prev) => prev || parsed.address2 || '');
        setCity((prev) => prev || parsed.city || '');
        setStateName((prev) => prev || parsed.stateName || '');
        setPostcode((prev) => prev || parsed.postcode || '');
        setBillingEmail((prev) => prev || parsed.billingEmail || '');
        setBillingPhone((prev) => prev || parsed.billingPhone || '');
        setOrderNotes((prev) => prev || parsed.orderNotes || '');
        setAppliedCouponCode((prev) => prev || parsed.appliedCouponCode || '');
        if (parsed.country) setCountry(parsed.country);
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
      }
    } catch (err) {
      void err;
    } finally {
      sessionStorage.removeItem('checkoutDraft');
    }
  }, []);

  useEffect(() => {
    clearPersistedCoupon();
    const codeFromCart = location?.state?.couponCode;
    if (typeof codeFromCart === 'string' && codeFromCart.trim()) {
      setAppliedCouponCode(codeFromCart.trim());
    } else {
      setAppliedCouponCode('');
      setCouponSummary(null);
    }
  }, [location?.state?.couponCode]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate('/auth');
      return;
    }

    const loadInstantItem = async () => {
      setLoading(true);
      setError('');
      try {
        if (typeof localStorage === 'undefined') {
          throw new Error('Instant purchase is not available in this environment');
        }
        const raw = localStorage.getItem('instantPurchase');
        if (!raw) {
          throw new Error('No item selected for instant purchase');
        }
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error('Instant purchase data is invalid. Please try again.');
        }
        const pid = parsed.productId || parsed.product_id;
        const variantIdRaw = parsed.variant_id != null ? Number(parsed.variant_id) : null;
        const qtyRaw = quantityParam || parsed.quantity || 1;
        const qty = Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;
        if (!pid) {
          throw new Error('Instant purchase item is missing. Please try again.');
        }

        const response = await fetch(`${API_BASE}/products/${pid}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load product for instant purchase');
        }
        const baseRetail = Number(data.customer_price || 0);
        const baseWholesale = Number(data.wholesaler_price || 0);
        const tier = localStorage.getItem('wholesalerToken') ? 'wholesale' : 'retail';
        let effectivePrice = 0;
        let variantName = null;
        const variants = Array.isArray(data.variants) ? data.variants : [];
        let targetVariant = null;
        if (variantIdRaw != null && variants.length > 0) {
          targetVariant = variants.find((v) => Number(v.id) === variantIdRaw);
          if (targetVariant && String(targetVariant.status || 'active').toLowerCase() === 'active') {
            variantName = targetVariant.variant_value || null;
            const vRetail =
              targetVariant.customer_price != null && targetVariant.customer_price !== ''
                ? Number(targetVariant.customer_price)
                : null;
            const vWholesale =
              targetVariant.wholesaler_price != null && targetVariant.wholesaler_price !== ''
                ? Number(targetVariant.wholesaler_price)
                : null;
            if (tier === 'wholesale') {
              effectivePrice =
                vWholesale != null && !Number.isNaN(vWholesale) && vWholesale > 0
                  ? vWholesale
                  : baseWholesale > 0
                  ? baseWholesale
                  : baseRetail > 0
                  ? baseRetail
                  : 0;
            } else {
              effectivePrice =
                vRetail != null && !Number.isNaN(vRetail) && vRetail > 0
                  ? vRetail
                  : baseRetail > 0
                  ? baseRetail
                  : baseWholesale > 0
                  ? baseWholesale
                  : 0;
            }
          }
        }
        if (!effectivePrice || effectivePrice <= 0) {
          const pricedResp = await fetch(`${API_BASE}/products/${pid}/priced`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const pricedData = await pricedResp.json();
          if (pricedResp.ok) {
            effectivePrice = Number(pricedData.effective_price || 0);
          } else if (tier === 'wholesale') {
            effectivePrice = baseWholesale > 0 ? baseWholesale : baseRetail;
          } else {
            effectivePrice = baseRetail > 0 ? baseRetail : baseWholesale;
          }
        }
        if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
          throw new Error('Price not available for instant purchase');
        }
        setInstantItem({
          productId: data.id,
          name: data.name,
          price: effectivePrice,
          quantity: qty,
          variant_id: variantIdRaw,
          variant_name: variantName,
        });
      } catch (err) {
        setInstantItem(null);
        setError(err.message || 'Something went wrong while preparing instant purchase');
      } finally {
        setLoading(false);
      }
    };

    const fetchCart = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/cart`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load cart');
        }
        setCart(data);
      } catch (err) {
        setError(err.message || 'Something went wrong while loading cart');
      } finally {
        setLoading(false);
      }
    };

    if (isInstant) {
      loadInstantItem();
    } else {
      fetchCart();
    }
  }, [navigate, isInstant, quantityParam]);

  useEffect(() => {
    const loadProfileDefaults = async () => {
      const token = getAuthToken();
      if (!token) return;
      if (typeof localStorage === 'undefined') return;

      const wholesalerToken = localStorage.getItem('wholesalerToken');
      const isWholesaler = Boolean(wholesalerToken);
      setCustomerTypeLabel(isWholesaler ? 'Wholesaler' : 'Retail Customer');

      const userInfoRaw = localStorage.getItem('userInfo');
      const wholesalerInfoRaw = localStorage.getItem('wholesalerInfo');
      const infoRaw = isWholesaler ? wholesalerInfoRaw : userInfoRaw;

      let info = null;
      if (infoRaw) {
        try {
          info = JSON.parse(infoRaw);
        } catch {
          info = null;
        }
      }

      const storedAddress = localStorage.getItem('userAddress') || '';
      const nameParts = splitFullName(info?.name || '');

      const nextDefaults = {
        firstName: nameParts.first,
        lastName: nameParts.last,
        companyName: info?.business_name || info?.company_name || '',
        address1: storedAddress || info?.address || '',
        address2: '',
        city: info?.city || '',
        stateName: info?.state || '',
        postcode: info?.pincode || '',
        billingEmail: info?.email || '',
        billingPhone: info?.phone || '',
      };

      try {
        const endpoint = isWholesaler ? `${API_BASE}/wholesalers/profile` : `${API_BASE}/users/profile`;
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (response.ok && data) {
          const parts = splitFullName(data.name || '');
          nextDefaults.firstName = parts.first || nextDefaults.firstName;
          nextDefaults.lastName = parts.last || nextDefaults.lastName;
          nextDefaults.billingEmail = data.email || nextDefaults.billingEmail;
          nextDefaults.billingPhone = data.phone || nextDefaults.billingPhone;
          nextDefaults.companyName = data.business_name || data.company_name || nextDefaults.companyName;
          nextDefaults.city = data.city || nextDefaults.city;
          nextDefaults.stateName = data.state || nextDefaults.stateName;
          nextDefaults.postcode = data.pincode || nextDefaults.postcode;
          nextDefaults.address1 = storedAddress || data.address || nextDefaults.address1;
        }
      } catch {
        void 0;
      }

      setProfileDefaults(nextDefaults);
    };

    loadProfileDefaults();

    const onFocus = () => loadProfileDefaults();
    const onStorage = (event) => {
      if (!event || !event.key) return;
      const keys = new Set(['userInfo', 'wholesalerInfo', 'userAddress', 'userToken', 'wholesalerToken']);
      if (keys.has(event.key)) {
        loadProfileDefaults();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('storage', onStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  useEffect(() => {
    if (shipDifferentAddress) return;

    const setIfUnchanged = (current, next, prevApplied, setter) => {
      if (!next) return;
      if (!current || String(current) === String(prevApplied)) {
        setter(next);
      }
    };

    setIfUnchanged(firstName, profileDefaults.firstName, appliedProfileDefaults.firstName, setFirstName);
    setIfUnchanged(lastName, profileDefaults.lastName, appliedProfileDefaults.lastName, setLastName);
    setIfUnchanged(companyName, profileDefaults.companyName, appliedProfileDefaults.companyName, setCompanyName);
    setIfUnchanged(address1, profileDefaults.address1, appliedProfileDefaults.address1, setAddress1);
    setIfUnchanged(address2, profileDefaults.address2, appliedProfileDefaults.address2, setAddress2);
    setIfUnchanged(city, profileDefaults.city, appliedProfileDefaults.city, setCity);
    setIfUnchanged(stateName, profileDefaults.stateName, appliedProfileDefaults.stateName, setStateName);
    setIfUnchanged(postcode, profileDefaults.postcode, appliedProfileDefaults.postcode, setPostcode);
    setIfUnchanged(billingEmail, profileDefaults.billingEmail, appliedProfileDefaults.billingEmail, setBillingEmail);
    setIfUnchanged(billingPhone, profileDefaults.billingPhone, appliedProfileDefaults.billingPhone, setBillingPhone);

    setAppliedProfileDefaults(profileDefaults);
  }, [
    profileDefaults,
    shipDifferentAddress,
    firstName,
    lastName,
    companyName,
    address1,
    address2,
    city,
    stateName,
    postcode,
    billingEmail,
    billingPhone,
    appliedProfileDefaults,
  ]);

  useEffect(() => {
    const validateAtCheckout = async () => {
      if (!appliedCouponCode || !cart || isInstant) {
        setCouponSummary(null);
        return;
      }
      const token = getAuthToken();
      if (!token) return;
      setLoadingCoupon(true);
      try {
        const response = await fetch(`${API_BASE}/coupons/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ code: appliedCouponCode }),
        });
        const data = await response.json();
        if (!response.ok || !data.valid) {
          setCouponSummary(null);
          setAppliedCouponCode('');
          return;
        }
        setCouponSummary({
          code: data.code,
          subtotal: Number(data.subtotal || 0),
          discountAmount: Number(data.discount_amount || 0),
          totalAfterDiscount: Number(data.total_after_discount || 0),
        });
      } catch {
        setCouponSummary(null);
      } finally {
        setLoadingCoupon(false);
      }
    };
    validateAtCheckout();
  }, [appliedCouponCode, cart, isInstant]);

  const cartItems = cart && Array.isArray(cart.items) ? cart.items : [];
  const instantItems = instantItem
    ? [
        {
          id: `${instantItem.productId}-${instantItem.variant_id ?? 'no-variant'}`,
          product: { name: instantItem.name },
          variant_name: instantItem.variant_name || null,
          quantity: instantItem.quantity,
          itemTotal: instantItem.price * instantItem.quantity,
        },
      ]
    : [];
  const items = isInstant ? instantItems : cartItems;
  const itemsCount = isInstant
    ? instantItem
      ? instantItem.quantity
      : 0
    : cartItems.reduce(
        (sum, item) => sum + (Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0),
        0,
      );
  const subtotal = isInstant
    ? instantItem
      ? instantItem.price * instantItem.quantity
      : 0
    : couponSummary
      ? couponSummary.subtotal
      : cart
        ? Number(cart.total || 0)
        : 0;
  const shipping = shippingFee;
  const discountAmount = couponSummary ? couponSummary.discountAmount : 0;
  const total = couponSummary
    ? couponSummary.totalAfterDiscount + shipping
    : subtotal + shipping;

  const buildShippingAddress = useCallback(() => {
    const lines = [];
    const nameLine = `${firstName} ${lastName}`.trim();
    if (nameLine) {
      lines.push(nameLine);
    }
    if (companyName) {
      lines.push(companyName);
    }
    if (address1) {
      lines.push(address1);
    }
    if (address2) {
      lines.push(address2);
    }
    const cityStatePost = [city, stateName, postcode].filter(Boolean).join(', ');
    if (cityStatePost) {
      lines.push(cityStatePost);
    }
    if (country) {
      lines.push(country);
    }
    return lines.join('\n');
  }, [address1, address2, city, companyName, country, firstName, lastName, postcode, stateName]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    if (!items.length) {
      setShippingFee(0);
      setShippingQuoteError('');
      setShippingQuoteLoading(false);
      return;
    }

    const ready =
      address1 &&
      city &&
      stateName &&
      postcode &&
      billingPhone;

    if (!ready) {
      setShippingFee(0);
      setShippingQuoteError('');
      setShippingQuoteLoading(false);
      return;
    }

    let active = true;
    setShippingQuoteLoading(true);
    setShippingQuoteError('');

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/shipping/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            shipping_address: buildShippingAddress(),
            phone: billingPhone,
            name: `${firstName} ${lastName}`.trim() || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to calculate shipping');
        }
        const fee = Number(
          data?.shipping_fee ??
            data?.shippingFee ??
            data?.final_price ??
            data?.finalPrice ??
            data?.price ??
            0,
        );
        if (!Number.isFinite(fee) || fee < 0) {
          throw new Error('Shipping quote is invalid');
        }
        if (!active) return;
        setShippingFee(fee);
        setShippingQuoteError('');
      } catch (err) {
        if (!active) return;
        setShippingFee(0);
        setShippingQuoteError(err.message || 'Failed to calculate shipping');
      } finally {
        if (active) {
          setShippingQuoteLoading(false);
        }
      }
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [items.length, address1, city, stateName, postcode, billingPhone, firstName, lastName, buildShippingAddress]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(false);
        return;
      }
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  const handleRazorpayPayment = async (token, shippingAddress) => {
    setPlacingOrder(true);
    setError('');
    setMessage('');
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Unable to load payment gateway. Please try again.');
      }
      const createUrl = isInstant ? `${API_BASE}/payment/create-order-instant` : `${API_BASE}/payment/create-order`;
      const createBody = {
        shipping_address: shippingAddress,
        billing_phone: billingPhone,
        notes: orderNotes,
        coupon_code: !isInstant ? (appliedCouponCode || undefined) : undefined,
      };
      if (isInstant) {
        if (!instantItem) {
          throw new Error('No item selected for instant purchase.');
        }
        createBody.product_id = instantItem.productId;
        createBody.quantity = instantItem.quantity;
        if (instantItem.variant_id != null) {
          createBody.variant_id = Number(instantItem.variant_id);
        }
      }
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createBody),
      });
      const createData = await createResponse.json();
      if (!createResponse.ok) {
        if (createData.hint === 'Razorpay_credentials_mismatch' && !isInstant) {
          setError(
            (createData.message || 'Razorpay is currently unavailable.') +
              ' Your order has not been charged. Payment method has been automatically switched to Cash on Delivery (COD) — you can click Place Order now.',
          );
          setMessage(
            '⚠ Razorpay credentials in backend are currently misconfigured. Ask store admin to regenerate API Keys in dashboard.razorpay.com → Settings → API Keys. Switching to COD.',
          );
          setPaymentMethod('cod');
          setPlacingOrder(false);
          return;
        }
        if (createData.hint === 'Razorpay_credentials_mismatch' && isInstant) {
          setError(
          (createData.message || 'Razorpay is currently unavailable.') +
            ' Your order has not been charged. Please switch Payment Method to Cash on Delivery (COD) using the radio button above, then click Place Order.',
          );
          setMessage(
            '⚠ Razorpay credentials in backend are currently misconfigured. Ask store admin to regenerate API Keys at dashboard.razorpay.com → Settings → API Keys.',
          );
          setPaymentMethod('cod');
          setPlacingOrder(false);
          return;
        }
        throw new Error(createData.message || 'Failed to initiate payment');
      }
      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Payment gateway not available');
      }
      const options = {
        key: createData.key_id,
        amount: createData.amount,
        currency: createData.currency || 'INR',
        name: 'Ashoka',
        description: 'Order payment',
        order_id: createData.razorpay_order_id,
        prefill: {
          name: `${firstName} ${lastName}`.trim() || undefined,
          email: billingEmail || undefined,
          contact: billingPhone || undefined,
        },
        notes: {
          order_id: String(createData.order_id),
        },
        handler: async (response) => {
          try {
            const verifyResponse = await fetch(`${API_BASE}/payment/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                order_id: createData.order_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) {
              throw new Error(verifyData.message || 'Payment verification failed');
            }
            const msg = verifyData.message || 'Payment successful';
            setMessage(msg);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('app:toast', {
                  detail: { message: msg, variant: 'success' },
                }),
              );
            }
            if (isInstant && typeof localStorage !== 'undefined') {
              localStorage.removeItem('instantPurchase');
            }
            setAppliedCouponCode('');
            setCouponSummary(null);
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('appliedCouponCode');
            }
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('clearCartCoupon', '1');
            }
            if (verifyData && verifyData.order_id) {
              navigate(`/order-confirmation?orderId=${verifyData.order_id}`);
            } else {
              navigate('/orders');
            }
          } catch (err) {
            setError(err.message || 'Payment verification failed');
          } finally {
            setPlacingOrder(false);
          }
        },
        theme: {
          color: '#3399cc',
        },
        modal: {
          ondismiss: () => {
            setPlacingOrder(false);
            if (isInstant) {
              setAppliedCouponCode('');
              setCouponSummary(null);
              clearPersistedCoupon();
            }
          },
        },
      };
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      setError(err.message || 'Something went wrong while initiating payment');
      setPlacingOrder(false);
    }
  };

  const handlePlaceOrder = async () => {
    const token = getAuthToken();
    if (!token) {
      navigate('/auth');
      return;
    }
    if (!isInstant && !items.length) {
      setError('Your cart is empty. Please add items before placing an order.');
      return;
    }
    if (isInstant && !instantItem) {
      setError('No item selected for instant purchase.');
      return;
    }
    if (!address1 || !city || !stateName || !postcode || !billingPhone) {
      setError('Please fill in your address and contact details before placing an order.');
      return;
    }
    if (shippingQuoteLoading) {
      setError('Calculating shipping. Please wait a moment and try again.');
      return;
    }
    if (shippingQuoteError) {
      setError(shippingQuoteError);
      return;
    }
    const shippingAddress = buildShippingAddress();
    if (paymentMethod === 'razorpay') {
      await handleRazorpayPayment(token, shippingAddress);
      return;
    }
    setPlacingOrder(true);
    setError('');
    setMessage('');
    try {
      const url = isInstant ? `${API_BASE}/orders/instant` : `${API_BASE}/orders/place`;
      const body = isInstant
        ? (() => {
            const ib = {
              product_id: instantItem.productId,
              quantity: instantItem.quantity,
              shipping_address: shippingAddress,
              billing_phone: billingPhone,
              payment_method: paymentMethod || 'cod',
              notes: orderNotes,
            };
            if (instantItem.variant_id != null) {
              ib.variant_id = Number(instantItem.variant_id);
            }
            return ib;
          })()
        : {
            shipping_address: shippingAddress,
            billing_phone: billingPhone,
            payment_method: paymentMethod || 'cod',
            notes: orderNotes,
            coupon_code: appliedCouponCode || undefined,
          };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to place order');
      }
      const msg = data.message || 'Order placed successfully';
      setMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
      if (isInstant && typeof localStorage !== 'undefined') {
        localStorage.removeItem('instantPurchase');
      }
      setAppliedCouponCode('');
      setCouponSummary(null);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('appliedCouponCode');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('clearCartCoupon', '1');
      }
      if (data && data.orderId) {
        navigate(`/order-confirmation?orderId=${data.orderId}`);
      } else {
        navigate('/orders');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while placing order');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleCreateAccountToggle = (checked) => {
    setCreateAccount(checked);
    if (!checked) return;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        'checkoutDraft',
        JSON.stringify({
          country,
          firstName,
          lastName,
          companyName,
          address1,
          address2,
          city,
          stateName,
          postcode,
          billingEmail,
          billingPhone,
          orderNotes,
          appliedCouponCode,
          paymentMethod,
        }),
      );
    }
    navigate('/auth');
  };

  const handleShipDifferentToggle = (checked) => {
    setShipDifferentAddress(checked);
    if (checked) {
      setAddress1('');
      setAddress2('');
      setCity('');
      setStateName('');
      setPostcode('');
      return;
    }
    setAddress1(profileDefaults.address1 || '');
    setAddress2(profileDefaults.address2 || '');
    setCity(profileDefaults.city || '');
    setStateName(profileDefaults.stateName || '');
    setPostcode(profileDefaults.postcode || '');
  };

  return (
    <div className="checkout-page">
      <section className="checkout-hero-section text-center text-white">
        <Container>
          <h1 className="checkout-hero-title">Checkout</h1>
          <nav className="checkout-breadcrumb">
            <span>Home</span>
            <span className="dot">•</span>
            <span className="active">Checkout</span>
          </nav>
          <div className="mt-2 small">
            You are logged in as{' '}
            <span className="fw-semibold">{customerTypeLabel}</span>
          </div>
        </Container>
      </section>

      <section className="checkout-main-section py-5">
        <Container>
          <div className="checkout-summary d-flex flex-wrap align-items-center justify-content-between mb-4">
            <div className="checkout-summary-steps">
              <span className="checkout-summary-step checkout-summary-step-active">Cart</span>
              <span className="checkout-summary-step-separator">›</span>
              <span className="checkout-summary-step checkout-summary-step-active">Checkout</span>
              <span className="checkout-summary-step-separator">›</span>
              <span className="checkout-summary-step">Order Complete</span>
            </div>
            <div className="checkout-summary-totals">
              <span className="checkout-summary-label">Items:</span>
              <span className="checkout-summary-value">{itemsCount}</span>
              <span className="checkout-summary-divider">•</span>
              <span className="checkout-summary-label">Total:</span>
              <span className="checkout-summary-value">₹{total.toFixed(2)}</span>
            </div>
          </div>
          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}
          {message && (
            <Alert variant="success" className="mb-3">
              {message}
            </Alert>
          )}
          {loading && (
            <div className="text-center mb-4">
              <Spinner animation="border" role="status" size="sm" className="me-2" />
              <span>Loading your cart...</span>
            </div>
          )}
          <Row className="g-4">
            <Col lg={7}>
              <div className="checkout-card">
                <h3 className="checkout-section-title mb-4">Billing Details</h3>
                <Form onSubmit={handleSubmit} className="checkout-form">
                  <Row className="g-3">
                    <Col md={12}>
                      <Form.Group controlId="checkoutCountry">
                        <Form.Label>Country</Form.Label>
                        <Form.Select
                          value={country}
                          onChange={(event) => setCountry(event.target.value)}
                        >
                          <option>United States</option>
                          <option>India</option>
                          <option>United Kingdom</option>
                          <option>Other</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="checkoutFirstName">
                        <Form.Label>First Name</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="First name"
                          value={firstName}
                          onChange={(event) => setFirstName(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="checkoutLastName">
                        <Form.Label>Last Name</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Last name"
                          value={lastName}
                          onChange={(event) => setLastName(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="checkoutCompany">
                        <Form.Label>Company Name</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Company name"
                          value={companyName}
                          onChange={(event) => setCompanyName(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="checkoutAddress1">
                        <Form.Label>Address</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Street address"
                          value={address1}
                          onChange={(event) => setAddress1(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="checkoutAddress2">
                        <Form.Control
                          type="text"
                          placeholder="Apartment, suite, unit etc. (optional)"
                          value={address2}
                          onChange={(event) => setAddress2(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="checkoutCity">
                        <Form.Label>Town / City</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Town / City"
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group controlId="checkoutState">
                        <Form.Label>State / Country</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="State / Country"
                          value={stateName}
                          onChange={(event) => setStateName(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group controlId="checkoutPostcode">
                        <Form.Label>Postcode / Zip</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Postcode / Zip"
                          value={postcode}
                          onChange={(event) => setPostcode(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="checkoutEmail">
                        <Form.Label>Email Address</Form.Label>
                        <Form.Control
                          type="email"
                          placeholder="Email address"
                          value={billingEmail}
                          onChange={(event) => setBillingEmail(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="checkoutPhone">
                        <Form.Label>Phone</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Phone"
                          value={billingPhone}
                          onChange={(event) => setBillingPhone(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Check
                        id="checkoutCreateAccount"
                        type="checkbox"
                        label="Create an account?"
                        className="mb-2"
                        checked={createAccount}
                        onChange={(event) => handleCreateAccountToggle(event.target.checked)}
                      />
                      <Form.Check
                        id="checkoutShipDifferent"
                        type="checkbox"
                        label="Ship to a different address?"
                        checked={shipDifferentAddress}
                        onChange={(event) => handleShipDifferentToggle(event.target.checked)}
                      />
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="checkoutOrderNotes">
                        <Form.Label>Order Notes</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          placeholder="Notes about your order, e.g. special notes for delivery."
                          value={orderNotes}
                          onChange={(event) => setOrderNotes(event.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </Form>
              </div>
            </Col>

            <Col lg={5}>
              <div className="checkout-card checkout-order-card">
                <h3 className="checkout-section-title mb-1">Your order</h3>
                <p className="checkout-order-subtitle mb-3">
                  Review your order summary and choose a secure payment method.
                </p>
                <div className="checkout-order-table mb-3">
                  <div className="checkout-order-header d-flex justify-content-between">
                    <span>Product</span>
                    <span>Total</span>
                  </div>
                  {items.map((item) => {
                    const variantName = item.variant_name || (item.product && item.product.variant_name);
                    return (
                      <div
                        key={item.id}
                        className="checkout-order-row d-flex justify-content-between align-items-start"
                      >
                        <div className="d-flex flex-column">
                          <span>
                            {item.product ? item.product.name : 'Product'} x{' '}
                            {item.quantity || 1}
                          </span>
                          {variantName && (
                            <span className="mt-1">
                              <Badge bg="secondary">{variantName}</Badge>
                            </span>
                          )}
                        </div>
                        <span>
                          ₹{Number(item.itemTotal || 0).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  {!items.length && !loading && (
                    <div className="checkout-order-row d-flex justify-content-between">
                      <span>Your cart is empty</span>
                      <span>₹0.00</span>
                    </div>
                  )}
                  <div className="checkout-order-row d-flex justify-content-between">
                    <span>Cart Subtotal</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  {couponSummary && discountAmount > 0 && (
                    <div className="checkout-order-row d-flex justify-content-between text-success">
                      <span>
                        Discount ({couponSummary.code})
                        {loadingCoupon && ' (checking...)'}
                      </span>
                      <span>-₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="checkout-order-row d-flex justify-content-between">
                    <span>Shipping</span>
                    <span>
                      {shippingQuoteLoading ? 'Calculating...' : shippingQuoteError ? 'Unavailable' : `₹${shipping.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="checkout-order-footer d-flex justify-content-between">
                    <span>Order Total</span>
                    <span>₹{total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="checkout-payment mb-3">
                  <Form.Check
                    id="paymentCod"
                    type="radio"
                    name="paymentMethod"
                    label="Cash on Delivery (COD)"
                    className="checkout-payment-option"
                    checked={paymentMethod === 'cod'}
                    onChange={() => setPaymentMethod('cod')}
                  />
                  <p className="checkout-payment-text">
                    Pay in cash when your order is delivered to your doorstep.
                  </p>
                  <Form.Check
                    id="paymentRazorpay"
                    type="radio"
                    name="paymentMethod"
                    label="Razorpay (UPI / Card / Netbanking)"
                    className="checkout-payment-option"
                    checked={paymentMethod === 'razorpay'}
                    onChange={() => setPaymentMethod('razorpay')}
                  />
                  <p className="checkout-payment-text">
                    You will be redirected to Razorpay secure checkout to complete the payment.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="success"
                  className="w-100 checkout-place-order-btn"
                  disabled={
                    placingOrder ||
                    loading ||
                    !items.length ||
                    shippingQuoteLoading ||
                    Boolean(shippingQuoteError) ||
                    !address1 ||
                    !city ||
                    !stateName ||
                    !postcode ||
                    !billingPhone
                  }
                  onClick={handlePlaceOrder}
                >
                  {placingOrder ? 'Placing Order...' : 'Place Order'}
                </Button>
              </div>
            </Col>
          </Row>
        </Container>
      </section>
    </div>
  );
};

export default Checkout;
