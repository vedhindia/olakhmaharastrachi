import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Button, Spinner, Alert } from 'react-bootstrap';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, ShoppingBag } from 'lucide-react';
import './Product.css';

const API_BASE = '/api';

const getAuthToken = () => {
  if (typeof localStorage === 'undefined') return null;
  const userToken = localStorage.getItem('userToken');
  if (userToken) return userToken;
  const wholesalerToken = localStorage.getItem('wholesalerToken');
  if (wholesalerToken) return wholesalerToken;
  return null;
};

const OrderConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate('/auth');
      return;
    }
    if (!orderIdParam) {
      navigate('/orders');
      return;
    }

    const fetchOrder = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/orders/${orderIdParam}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load order details');
        }
        setOrder(data);
      } catch (err) {
        setError(err.message || 'Something went wrong while loading order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [navigate, orderIdParam]);

  const items = order && Array.isArray(order.items) ? order.items : [];
  const total = Number(order ? order.total_amount || 0 : 0);
  const discount = Number(order ? order.discount_amount || 0 : 0);
  const shipping = Number(
    order ? order.shipping_fee ?? order.shippingFee ?? order.shipping_amount ?? 0 : 0,
  );
  const subtotal = total + discount - shipping;

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Order Confirmation</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <span>Home</span>
            <span className="dot">•</span>
            <span>Checkout</span>
            <span className="dot">•</span>
            <span className="active">Order Confirmation</span>
          </nav>
        </Container>
      </section>

      <section className="product-content py-5">
        <Container>
          {loading && (
            <div className="text-center py-5">
              <Spinner animation="border" role="status" className="me-2" />
              <span>Loading your order...</span>
            </div>
          )}

          {!loading && error && (
            <Alert variant="danger" className="mb-4 text-center">
              {error}
            </Alert>
          )}

          {!loading && !error && order && (
            <>
              <Row className="justify-content-center mb-4">
                <Col lg={8}>
                  <div className="text-center mb-4">
                    <CheckCircle2 size={64} className="text-success mb-3" />
                    <h2 className="fw-bold mb-2">Thank you! Your order is confirmed.</h2>
                    <p className="text-muted mb-1">
                      Your order number is{' '}
                      <strong>{order.display_order_id || order.public_id || `#${order.id}`}</strong>.
                    </p>
                    <p className="text-muted mb-0">
                      You will receive updates when your order status changes.
                    </p>
                  </div>
                </Col>
              </Row>

              <Row className="justify-content-center">
                <Col lg={8}>
                  <div className="cart-summary-box mb-4">
                    <h5 className="mb-3">Order Summary</h5>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Order Number</span>
                      <span className="fw-bold">
                        {order.display_order_id || order.public_id || `#${order.id}`}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Placed On</span>
                      <span className="fw-bold">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleString()
                          : '-'}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Payment Method</span>
                      <span className="fw-bold text-capitalize">
                        {order.payment_method || 'cod'}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Order Status</span>
                      <span className="fw-bold text-capitalize">
                        {order.status || 'pending'}
                      </span>
                    </div>
                    <hr />
                    <div className="d-flex justify-content-between mb-2">
                      <span>Subtotal</span>
                      <span className="fw-bold">₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Discount</span>
                      <span className="fw-bold text-success">
                        -₹{discount.toFixed(2)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Shipping</span>
                      <span className="fw-bold">₹{shipping.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Total Paid</span>
                      <span className="fw-bold">₹{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="cart-summary-box mb-4">
                    <h5 className="mb-3">Items in your order</h5>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="d-flex justify-content-between align-items-center mb-2"
                      >
                        <div>
                          <div className="fw-semibold">
                            {item.product_name || (item.product && item.product.name) || 'Product'}
                          </div>
                          <div className="text-muted small">
                            Quantity: {item.quantity} × ₹{Number(item.price || 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="fw-bold">
                          ₹{(Number(item.price || 0) * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {!items.length && (
                      <div className="text-muted small">No items found for this order.</div>
                    )}
                  </div>

                  <div className="d-flex flex-wrap gap-3 justify-content-between">
                    <Button as={Link} to="/orders" variant="outline-secondary">
                      View My Orders
                    </Button>
                    <Button as={Link} to="/shop" variant="success">
                      <ShoppingBag size={18} className="me-2" />
                      Continue Shopping
                    </Button>
                  </div>
                </Col>
              </Row>
            </>
          )}
        </Container>
      </section>
    </div>
  );
};

export default OrderConfirmation;
