import { useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Alert, Pagination, Badge } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Truck, RotateCcw, X } from 'lucide-react';
import './Product.css';

const API_BASE = '/api';

const buildImageUrl = (imagePath) => {
  if (!imagePath || typeof imagePath !== 'string') return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
  if (imagePath.startsWith('/api/')) return imagePath;
  const trimmed = imagePath.replace(/^\/+/, '');
  if (trimmed.startsWith('uploads/')) return `${API_BASE}/${trimmed}`;
  return `${API_BASE}/uploads/${trimmed}`;
};

const getAuthToken = () => {
  if (typeof localStorage === 'undefined') return null;
  const userToken = localStorage.getItem('userToken');
  if (userToken) return userToken;
  const wholesalerToken = localStorage.getItem('wholesalerToken');
  if (wholesalerToken) return wholesalerToken;
  return null;
};

const Cart = () => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [customerType, setCustomerType] = useState('Retail Customer');
  const [couponCode, setCouponCode] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const wholesalerToken = localStorage.getItem('wholesalerToken');
    if (wholesalerToken) {
      setCustomerType('Wholesaler');
    } else {
      setCustomerType('Retail Customer');
    }
  }, []);

  const loadActiveCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const response = await fetch(`${API_BASE}/coupons/public/active`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load coupons');
      }
      const list = Array.isArray(data.coupons) ? data.coupons : [];
      setAvailableCoupons(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCoupons(false);
    }
  };

  useEffect(() => {
    loadActiveCoupons();
  }, []);

  const handleApplyCoupon = async () => {
    const token = getAuthToken();
    if (!token) {
      setError('Please login to apply coupon');
      return;
    }
    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }
    setApplyingCoupon(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/coupons/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: couponCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to validate coupon');
      }
      if (!data.valid) {
        setAppliedCoupon(null);
        const msg = data.message || 'Coupon is not valid for your cart';
        setError(msg);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app:toast', {
              detail: { message: msg, variant: 'danger' },
            }),
          );
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('appliedCouponCode');
        }
        return;
      }
      setAppliedCoupon(data);
      const msg = data.message || 'Coupon applied successfully';
      setMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('appliedCouponCode');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while applying coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleClearCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setError('');
    setMessage('');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('appliedCouponCode');
    }
  };

  useEffect(() => {
    const maybeClearAfterOrder = () => {
      if (typeof sessionStorage === 'undefined') return;
      const flag = sessionStorage.getItem('clearCartCoupon');
      if (!flag) return;
      setCouponCode('');
      setAppliedCoupon(null);
      setError('');
      setMessage('');
      sessionStorage.removeItem('clearCartCoupon');
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('appliedCouponCode');
      }
    };
    maybeClearAfterOrder();
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', maybeClearAfterOrder);
      return () => window.removeEventListener('pageshow', maybeClearAfterOrder);
    }
    return undefined;
  }, []);

  const loadCart = async () => {
    const token = getAuthToken();
    if (!token) {
      setError('Please login as customer or wholesaler to view your cart');
      return;
    }
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
      const items = data && Array.isArray(data.items) ? data.items : [];
      const count = items.length;
      const safeCount = Number.isNaN(count) || count < 0 ? 0 : count;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cartCount', String(safeCount));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:update'));
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while loading cart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('appliedCouponCode');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('appliedCouponCode');
    }
    loadCart();
  }, []);

  const handleQuantityChange = async (item, quantity) => {
    const token = getAuthToken();
    if (!token) {
      setError('Please login to update cart');
      return;
    }
    setMessage('');
    setError('');
    try {
      const payload = { product_id: item.product_id, quantity };
      if (item.variant_id != null) {
        payload.variant_id = Number(item.variant_id);
      }
      const response = await fetch(`${API_BASE}/cart/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update cart');
      }
      await loadCart();
      const msg = 'Cart updated';
      setMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while updating cart');
    }
  };

  const handleRemoveItem = async (item) => {
    const token = getAuthToken();
    if (!token) {
      setError('Please login to update cart');
      return;
    }
    setMessage('');
    setError('');
    try {
      const payload = { product_id: item.product_id };
      if (item.variant_id != null) {
        payload.variant_id = Number(item.variant_id);
      }
      const response = await fetch(`${API_BASE}/cart/remove`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove item');
      }
      await loadCart();
      const msg = 'Item removed from cart';
      setMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while removing item');
    }
  };

  const items = cart && Array.isArray(cart.items) ? cart.items : [];
  const itemsPerPage = 5;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const indexOfLastItem = safePage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = items.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Shopping Cart</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <a href="/" className='text-decoration-none text-white'>Home</a>
            <span className="dot">•</span>
            <span>Cart</span>
          </nav>
          <div className="mt-2 small">
            You are logged in as{' '}
            <span className="fw-semibold">{customerType}</span>
          </div>
        </Container>
      </section>

      <section className="product-content py-5">
        <Container>
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
            <div className="text-center py-5">
              <span>Loading cart...</span>
            </div>
          )}

          {!loading && !items.length && !error && (
            <div className="text-center py-5">
              <p className="mb-3">Your cart is empty.</p>
              <Button as={Link} to="/shop" variant="success">
                Go to Shop
              </Button>
            </div>
          )}

          {!loading && items.length > 0 && (
            <Row className="g-4 align-items-start">
              <Col lg={8}>
                <div className="cart-panel cart-panel-coupon d-flex flex-column flex-md-row gap-3 align-items-md-center justify-content-between">
                  <div className="d-flex align-items-center gap-2 w-100">
                    <span className="fw-semibold">Have a coupon?</span>
                    <input
                      type="text"
                      className="form-control cart-coupon-input"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                    {(couponCode.trim() || appliedCoupon) && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleClearCoupon}
                        aria-label="Clear coupon"
                        title="Clear coupon"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      variant="success"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || applyingCoupon}
                    >
                      {applyingCoupon ? 'Applying...' : 'Apply'}
                    </Button>
                  </div>
                </div>

                <div className="cart-panel cart-panel-products">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0">Products</h6>
                    <span className="small text-muted">More</span>
                  </div>

                  <Table responsive hover className="align-middle cart-table mb-0">
                    <tbody>
                      {currentItems.map((item) => (
                        <tr
                          key={item.id}
                          className="cart-row-clickable cursor-pointer"
                          onClick={() => {
                            if (item.product_id) {
                              navigate(`/product/${item.product_id}`);
                            }
                          }}
                        >
                          <td className="text-center">
                            <div className="cart-img-wrapper mx-auto">
                              {(() => {
                                const images =
                                  item.product && Array.isArray(item.product.images) ? item.product.images : [];
                                const primary = images.find((img) => img && img.is_primary) || images[0] || null;
                                const src = primary && primary.image_url ? buildImageUrl(String(primary.image_url)) : null;
                                if (!src) return <span className="small text-muted">No Image</span>;
                                return (
                                  <Link to={`/product/${item.product_id}`}>
                                    <img
                                      src={src}
                                      alt={item.product && item.product.name ? item.product.name : 'Product'}
                                      className="img-fluid"
                                    />
                                  </Link>
                                );
                              })()}
                            </div>
                          </td>
                          <td>
                            <Link
                              to={`/product/${item.product_id}`}
                              className="text-decoration-none text-dark"
                            >
                              <div className="fw-semibold">
                                {item.product ? item.product.name : 'Product'}
                              </div>
                            </Link>
                            {item.variant_name && (
                              <div className="small mt-1">
                                <Badge bg="secondary">{item.variant_name}</Badge>
                              </div>
                            )}
                            <div className="small text-success">In stock</div>
                          </td>
                          <td className="text-center fw-bold">
                            ₹{Number(item.price || 0).toFixed(2)}
                          </td>
                          <td className="text-center">
                            <div className="qty-control">
                              <button
                                type="button"
                                className="qty-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuantityChange(
                                    item,
                                    item.quantity > 1 ? item.quantity - 1 : 1
                                  );
                                }}
                              >
                                −
                              </button>
                              <span className="qty-value">{item.quantity}</span>
                              <button
                                type="button"
                                className="qty-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuantityChange(item, item.quantity + 1);
                                }}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="text-center d-none d-lg-table-cell">
                            ₹{Number(item.itemTotal || 0).toFixed(2)}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="cart-remove-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                return handleRemoveItem(item);
                              }}
                            >
                              <span className="text-danger small me-1">Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  {totalPages > 1 && (
                    <div className="pagination-wrapper d-flex justify-content-center mt-3">
                      <Pagination>
                        <Pagination.Prev
                          disabled={safePage === 1}
                          onClick={() => {
                            if (safePage > 1) {
                              setCurrentPage(safePage - 1);
                            }
                          }}
                        />
                        {Array.from({ length: totalPages }).map((_, index) => {
                          const pageNumber = index + 1;
                          return (
                            <Pagination.Item
                              key={pageNumber}
                              active={safePage === pageNumber}
                              onClick={() => setCurrentPage(pageNumber)}
                            >
                              {pageNumber}
                            </Pagination.Item>
                          );
                        })}
                        <Pagination.Next
                          disabled={safePage === totalPages}
                          onClick={() => {
                            if (safePage < totalPages) {
                              setCurrentPage(safePage + 1);
                            }
                          }}
                        />
                      </Pagination>
                    </div>
                  )}
                </div>

                {availableCoupons.length > 0 && (
                  <div className="cart-panel cart-panel-coupons">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0">Available Coupons</h6>
                      {loadingCoupons && <span className="small text-muted">Loading...</span>}
                    </div>
                    {availableCoupons.map((c, idx) => (
                      <div
                        key={c.id}
                        className="d-flex justify-content-between align-items-center py-2 border-top"
                      >
                        <div>
                          <div className="d-flex align-items-center gap-2">
                            {idx === 0 && <span className="badge bg-warning text-dark">Best Coupon</span>}
                            <div className="fw-semibold">{c.code}</div>
                          </div>
                          <div className="small text-muted">
                            {c.discount_type === 'percentage'
                              ? `${c.discount_value}% off`
                              : `₹${Number(c.discount_value || 0).toFixed(0)} off`}
                            {c.min_order_value &&
                              Number(c.min_order_value) > 0 &&
                              ` • Min order ₹${Number(c.min_order_value).toFixed(0)}`}
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => {
                              setCouponCode(c.code);
                              handleApplyCoupon();
                            }}
                          >
                            Apply
                          </Button>
                          <Button
                            variant="outline-success"
                            size="sm"
                            onClick={async () => {
                              try {
                                if (navigator.clipboard?.writeText) {
                                  await navigator.clipboard.writeText(c.code);
                                  setCouponCode(c.code);
                                  setMessage('Coupon code copied');
                                } else {
                                  setCouponCode(c.code);
                                }
                              } catch {
                                setCouponCode(c.code);
                              }
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="mt-3">
                      <Button
                        variant="success"
                        className="w-100"
                        onClick={handleApplyCoupon}
                        disabled={!couponCode.trim()}
                      >
                        Apply Coupon
                      </Button>
                    </div>
                  </div>
                )}
              </Col>
              <Col lg={4}>
                <div className="cart-summary-box">
                  <h5 className="mb-3">Order Summary</h5>
                  {(() => {
                    const baseTotal = cart ? Number(cart.total || 0) : 0;
                    const subtotal = appliedCoupon
                      ? Number(appliedCoupon.subtotal || baseTotal)
                      : baseTotal;
                    const discountAmount = appliedCoupon
                      ? Number(appliedCoupon.discount_amount || 0)
                      : 0;
                    const finalTotal = appliedCoupon
                      ? Number(appliedCoupon.total_after_discount || subtotal)
                      : subtotal;
                    return (
                      <>
                        <div className="d-flex justify-content-between mb-2">
                          <span>Subtotal</span>
                          <span className="fw-bold">₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="d-flex justify-content-between mb-2">
                          <span>Discount</span>
                          <span className="text-success">
                            {discountAmount > 0 ? `-₹${discountAmount.toFixed(2)}` : '₹0.00'}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between mb-2">
                          <span>Delivery</span>
                          <span className="text-success">Free</span>
                        </div>
                        <div className="d-flex justify-content-between mb-3">
                          <span>Tax</span>
                          <span>₹0.00</span>
                        </div>
                        <div className="d-flex justify-content-between mb-3 border-top pt-3">
                          <span className="fw-bold">Total</span>
                          <span className="fw-bold">₹{finalTotal.toFixed(2)}</span>
                        </div>
                      </>
                    );
                  })()}
                  <Button
                    as={Link}
                    to="/checkout"
                    state={{ couponCode: appliedCoupon?.code || '' }}
                    variant="success"
                    className="w-100 mb-3"
                  >
                    Proceed to Checkout
                  </Button>
                  <div className="d-flex flex-column gap-2 small text-muted">
                    <div className="d-flex align-items-center gap-2">
                      <ShieldCheck size={16} /> <span>100% Secure Payments</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Truck size={16} /> <span>Fast Delivery</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <RotateCcw size={16} /> <span>Easy Returns</span>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          )}
        </Container>
      </section>
    </div>
  );
};

export default Cart;
