import React, { useEffect, useRef, useState } from 'react';
import { Container, Row, Col, Table, Alert, Spinner, Badge, Button, Modal } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

const buildImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (typeof imagePath !== 'string') return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const trimmed = imagePath.replace(/^\/+/, '');
  return `${API_BASE}/${trimmed}`;
};

const RETURN_REASONS = [
  'Damaged product',
  'Wrong item received',
  'Missing parts/accessories',
  'Quality issue',
  'Not as described',
  'Other',
];

const Orders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customerType, setCustomerType] = useState('Retail Customer');
  const [scope, setScope] = useState('recent');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 6;
  const [showDetails, setShowDetails] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const autoOpenedRef = useRef(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewProduct, setReviewProduct] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnMessage, setReturnMessage] = useState('');
  const [returnPhotos, setReturnPhotos] = useState([]);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const wholesalerToken = localStorage.getItem('wholesalerToken');
      if (wholesalerToken) {
        setCustomerType('Wholesaler');
      } else {
        setCustomerType('Retail Customer');
      }
    }

    const token = getAuthToken();
    if (!token) {
      navigate('/auth');
      return;
    }

    const fetchOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (scope) params.set('scope', scope);
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_BASE}/orders${query}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load orders');
        }
        const nextOrders = Array.isArray(data)
          ? data
          : data && Array.isArray(data.orders)
          ? data.orders
          : [];
        setOrders(nextOrders);
        if (data && typeof data.totalPages === 'number') {
          setTotalPages(Math.max(1, data.totalPages));
        } else {
          setTotalPages(1);
        }
        const orderIdParam = new URLSearchParams(location.search).get('orderId');
        if (orderIdParam && !autoOpenedRef.current) {
          autoOpenedRef.current = true;
          openDetails({ id: orderIdParam });
        }
      } catch (err) {
        setError(err.message || 'Something went wrong while loading orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [navigate, scope, location.search, page]);

  const handleScopeChange = (nextScope) => {
    if (nextScope === scope) return;
    setScope(nextScope);
    setPage(1);
    setActionMessage('');
    setActionError('');
  };

  const openDetails = (order) => {
    setSelectedOrder(order);
    setShowDetails(true);
    setActionMessage('');
    setActionError('');
    const token = getAuthToken();
    if (!token) {
      setActionError('Please login again to view order details.');
      return;
    }
    setDetailsLoading(true);
    fetch(`${API_BASE}/orders/${order.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load order details');
        }
        setSelectedOrder(data);
      })
      .catch((err) => {
        setActionError(err.message || 'Something went wrong while loading order details');
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedOrder(null);
    setActionMessage('');
    setActionError('');
  };

  const openReview = (item) => {
    const product = item?.product;
    const productId = product?.id || item?.product_id;
    const productName = product?.name || item?.product_name || 'Product';
    if (!productId) {
      setActionError('Product not found for review.');
      return;
    }
    setReviewProduct({ id: productId, name: productName });
    setReviewRating(5);
    setReviewComment('');
    setReviewError('');
    setReviewMessage('');
    setShowReviewModal(true);
  };

  const closeReview = () => {
    if (reviewSubmitting) return;
    setShowReviewModal(false);
    setReviewProduct(null);
    setReviewRating(5);
    setReviewComment('');
    setReviewError('');
    setReviewMessage('');
  };

  const openReturn = (order) => {
    if (typeof localStorage !== 'undefined') {
      const wholesalerToken = localStorage.getItem('wholesalerToken');
      if (wholesalerToken) {
        setActionError('Return requests are available for retail customers only.');
        return;
      }
    }
    if (!order || String(order.status || '').toLowerCase() !== 'delivered') {
      setActionError('You can request a return only after the order is delivered.');
      return;
    }
    setReturnOrder(order);
    setReturnReason('');
    setReturnMessage('');
    setReturnPhotos([]);
    setReturnError('');
    setReturnSuccess('');
    setShowReturnModal(true);
  };

  const closeReturn = () => {
    if (returnSubmitting) return;
    setShowReturnModal(false);
    setReturnOrder(null);
    setReturnReason('');
    setReturnMessage('');
    setReturnPhotos([]);
    setReturnError('');
    setReturnSuccess('');
  };

  const submitReturnRequest = async () => {
    const token = getAuthToken();
    if (!token) {
      setReturnError('Please login again to request a return.');
      return;
    }
    if (!returnOrder?.id) {
      setReturnError('Order not found for return request.');
      return;
    }
    if (!returnReason) {
      setReturnError('Please select a return reason.');
      return;
    }

    setReturnSubmitting(true);
    setReturnError('');
    setReturnSuccess('');
    try {
      const formData = new FormData();
      formData.append('order_id', String(returnOrder.id));
      formData.append('reason', returnReason);
      if (returnMessage.trim()) formData.append('message', returnMessage.trim());
      if (returnPhotos && returnPhotos.length > 0) {
        Array.from(returnPhotos)
          .slice(0, 5)
          .forEach((file) => formData.append('photos', file));
      }

      const response = await fetch(`${API_BASE}/returns`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to submit return request');
      }
      const msg = data?.message || 'Return request submitted successfully';
      setReturnSuccess(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
      setTimeout(() => closeReturn(), 700);
    } catch (err) {
      const msg = err?.message || 'Something went wrong while submitting return request';
      setReturnError(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'danger' },
          }),
        );
      }
    } finally {
      setReturnSubmitting(false);
    }
  };

  const submitReview = async () => {
    const token = getAuthToken();
    if (!token) {
      setReviewError('Please login again to submit review.');
      return;
    }
    if (!reviewProduct?.id) {
      setReviewError('Product not found for review.');
      return;
    }
    if (!selectedOrder || selectedOrder.status !== 'delivered') {
      setReviewError('You can submit a review only after the order is delivered.');
      return;
    }

    setReviewSubmitting(true);
    setReviewError('');
    setReviewMessage('');
    try {
      const response = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: reviewProduct.id,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to submit review');
      }
      const msg = 'Review submitted successfully and is pending approval';
      setReviewMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
      setTimeout(() => closeReview(), 600);
    } catch (err) {
      const msg = err?.message || 'Something went wrong while submitting review';
      setReviewError(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'danger' },
          }),
        );
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    const token = getAuthToken();
    if (!token) {
      setActionError('Please login again to manage your orders.');
      return;
    }
    if (typeof window !== 'undefined') {
      const proceed = window.confirm('Are you sure you want to cancel this order?');
      if (!proceed) return;
    }
    setActionMessage('');
    setActionError('');
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel order');
      }
      const msg = data.message || 'Order cancelled successfully';
      setActionMessage(msg);
      const updated = orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'cancelled',
            }
          : o,
      );
      setOrders(updated);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          status: 'cancelled',
        });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
    } catch (err) {
      setActionError(err.message || 'Something went wrong while cancelling order');
    }
  };

  const openInvoice = async (orderId) => {
    if (typeof window === 'undefined') return;
    const token = getAuthToken();
    if (!token) {
      setActionError('Please login again to view invoice.');
      return;
    }
    setActionMessage('');
    setActionError('');
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/invoice-download-pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to load invoice');
      }
      const pdfBlob = await response.blob();
      const url = window.URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setActionError(err.message || 'Failed to load invoice');
    }
  };

  const downloadInvoice = async (orderId, publicOrderId) => {
    const token = getAuthToken();
    if (!token) {
      setActionError('Please login again to download invoice.');
      return;
    }
    setActionMessage('');
    setActionError('');
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}/invoice-download-pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to download invoice');
      }
      const pdfBlob = await response.blob();
      const blob = new Blob([pdfBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${publicOrderId || orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err.message || 'Failed to download invoice');
    }
  };

  const buildPagination = () => {
    const safeTotal = Math.max(1, totalPages || 1);
    const safePage = Math.min(Math.max(1, page), safeTotal);
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    const start = Math.max(1, safePage - half);
    const end = Math.min(safeTotal, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    const pages = [];
    for (let p = adjustedStart; p <= end; p += 1) pages.push(p);
    return { safePage, safeTotal, pages };
  };

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">My Orders</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <a href="/" className="text-decoration-none text-white">
              Home
            </a>
            <span className="dot">•</span>
            <span>My Orders</span>
          </nav>
          <div className="mt-2 small">
            You are logged in as <span className="fw-semibold">{customerType}</span>
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

          {loading && (
            <div className="text-center py-5">
              <Spinner animation="border" role="status" size="sm" className="me-2" />
              <span>Loading your orders...</span>
            </div>
          )}

          {!loading && !error && !orders.length && (
            <div className="text-center py-5">
              <p className="mb-3">You have not placed any orders yet.</p>
              <Link to="/shop" className="btn btn-success">
                Start Shopping
              </Link>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <>
              <Row className="mb-3">
                <Col className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div className="btn-group">
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        scope === 'recent' ? 'btn-success' : 'btn-outline-success'
                      }`}
                      onClick={() => handleScopeChange('recent')}
                    >
                      Recent Orders
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        scope === 'history' ? 'btn-success' : 'btn-outline-success'
                      }`}
                      onClick={() => handleScopeChange('history')}
                    >
                      Order History
                    </button>
                  </div>
                  {actionMessage && <span className="text-success small">{actionMessage}</span>}
                  {actionError && <span className="text-danger small">{actionError}</span>}
                </Col>
              </Row>
              <Row>
                <Col>
                  <div className="table-responsive">
                    <Table striped hover className="cart-table align-middle">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Product</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Payment</th>
                          <th>Items</th>
                          <th>Total Amount (₹)</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => {
                          const createdAt = order.created_at || order.createdAt;
                          const dateStr = createdAt ? new Date(createdAt).toLocaleString() : '-';
                          const itemCount = Array.isArray(order.items)
                            ? order.items.reduce((sum, it) => sum + (it.quantity || 0), 0)
                            : 0;
                          const total = Number(order.total_amount || 0);
                          const paymentMethod = (order.payment_method || 'cod').toLowerCase();
                          const paymentStatus = (order.payment_status || 'pending').toLowerCase();

                          let paymentLabel = 'Cash on Delivery';
                          if (paymentMethod !== 'cod') {
                            paymentLabel = 'Online (Razorpay)';
                          }

                          let paymentVariant = 'secondary';
                          if (paymentStatus === 'paid') paymentVariant = 'success';
                          else if (paymentStatus === 'failed') paymentVariant = 'danger';
                          else if (paymentStatus === 'refunded') paymentVariant = 'warning';

                          let firstItem = null;
                          if (Array.isArray(order.items) && order.items.length > 0) {
                            firstItem = order.items[0];
                          }

                          let productLink = null;
                          let productName = '';
                          let productImageUrl = null;
                          if (firstItem) {
                            const product = firstItem.product;
                            const productId = product?.id;
                            productName = product?.name || firstItem.product_name || 'Product';
                            if (product && Array.isArray(product.images) && product.images.length > 0) {
                              const primaryImage =
                                product.images.find((img) => img.is_primary) || product.images[0];
                              if (primaryImage && primaryImage.image_url) {
                                productImageUrl = buildImageUrl(primaryImage.image_url);
                              }
                            }
                            if (productId) {
                              productLink = `/product/${productId}`;
                            }
                          }

                          const publicId = order.display_order_id || order.public_id || order.id;

                          return (
                            <tr key={order.id}>
                              <td>{publicId}</td>
                              <td>
                                {productLink ? (
                                  <Link
                                    to={productLink}
                                    className="d-inline-flex align-items-center text-decoration-none text-dark"
                                  >
                                    {productImageUrl && (
                                      <img
                                        src={productImageUrl}
                                        alt={productName}
                                        style={{
                                          width: 40,
                                          height: 40,
                                          objectFit: 'cover',
                                          borderRadius: 4,
                                          marginRight: 8,
                                        }}
                                      />
                                    )}
                                    <span className="text-truncate" style={{ maxWidth: 160 }}>
                                      {productName}
                                    </span>
                                  </Link>
                                ) : (
                                  <span className="text-muted small">-</span>
                                )}
                              </td>
                              <td>{dateStr}</td>
                              <td className="text-capitalize">{order.status || 'pending'}</td>
                              <td>
                                <div className="d-flex flex-column gap-1">
                                  <span>{paymentLabel}</span>
                                  <Badge bg={paymentVariant} pill className="text-uppercase">
                                    {paymentStatus}
                                  </Badge>
                                </div>
                              </td>
                              <td>{itemCount}</td>
                              <td>₹{total.toFixed(2)}</td>
                              <td>
                                <div className="d-flex flex-wrap gap-2">
                                  <Button
                                    variant="outline-success"
                                    size="sm"
                                    onClick={() => openDetails(order)}
                                  >
                                    View
                                  </Button>
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={() => downloadInvoice(order.id, publicId)}
                                  >
                                    Download Invoice
                                  </Button>
                                  {String(order.status || '').toLowerCase() === 'delivered' &&
                                    (typeof localStorage === 'undefined' ||
                                      !localStorage.getItem('wholesalerToken')) && (
                                      <Button
                                        variant="outline-warning"
                                        size="sm"
                                        onClick={() => openReturn(order)}
                                      >
                                        Return
                                      </Button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <nav className="mt-4" aria-label="Orders pagination">
                      <ul className="pagination justify-content-center mb-0">
                        {(() => {
                          const { safePage, safeTotal, pages } = buildPagination();
                          return (
                            <>
                              <li className={`page-item ${safePage <= 1 ? 'disabled' : ''}`}>
                                <button
                                  type="button"
                                  className="page-link"
                                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                                  disabled={safePage <= 1}
                                >
                                  ‹
                                </button>
                              </li>
                              {pages.map((p) => (
                                <li key={p} className={`page-item ${p === safePage ? 'active' : ''}`}>
                                  <button
                                    type="button"
                                    className="page-link"
                                    onClick={() => setPage(p)}
                                  >
                                    {p}
                                  </button>
                                </li>
                              ))}
                              <li className={`page-item ${safePage >= safeTotal ? 'disabled' : ''}`}>
                                <button
                                  type="button"
                                  className="page-link"
                                  onClick={() => setPage((p) => Math.min(safeTotal, p + 1))}
                                  disabled={safePage >= safeTotal}
                                >
                                  ›
                                </button>
                              </li>
                            </>
                          );
                        })()}
                      </ul>
                    </nav>
                  )}
                </Col>
              </Row>
            </>
          )}
        </Container>
      </section>

      <Modal show={showDetails} onHide={closeDetails} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            Order #{selectedOrder?.id}{' '}
            {selectedOrder && (
              <Badge bg="secondary" className="text-uppercase ms-2">
                {selectedOrder.status}
              </Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrder && (
            <>
              {detailsLoading && (
                <div className="text-center mb-3">
                  <Spinner animation="border" role="status" size="sm" className="me-2" />
                  <span>Loading order details...</span>
                </div>
              )}
              <Row className="mb-3">
                <Col md={6}>
                  <div className="mb-2">
                    <strong>Placed On:</strong>{' '}
                    {selectedOrder.created_at || selectedOrder.createdAt
                      ? new Date(
                          selectedOrder.created_at || selectedOrder.createdAt,
                        ).toLocaleString()
                      : '-'}
                  </div>
                  <div className="mb-2">
                    <strong>Payment Method:</strong>{' '}
                    {(selectedOrder.payment_method || 'cod').toLowerCase() === 'cod'
                      ? 'Cash on Delivery'
                      : 'Online (Razorpay)'}
                  </div>
                  <div className="mb-2">
                    <strong>Payment Status:</strong>{' '}
                    <span className="text-capitalize">
                      {selectedOrder.payment_status || 'pending'}
                    </span>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="mb-2">
                    <strong>Current Status:</strong>{' '}
                    <span className="text-capitalize">
                      {selectedOrder.status || 'pending'}
                    </span>
                  </div>
                  <div className="mb-2">
                    <strong>Total Amount:</strong>{' '}
                    ₹{Number(selectedOrder.total_amount || 0).toFixed(2)}
                  </div>
                  {selectedOrder.coupon_code && (
                    <div className="mb-2">
                      <strong>Coupon:</strong> {selectedOrder.coupon_code}
                    </div>
                  )}
                  {selectedOrder.discount_amount && (
                    <div className="mb-2">
                      <strong>Discount:</strong>{' '}
                      -₹{Number(selectedOrder.discount_amount || 0).toFixed(2)}
                    </div>
                  )}
                </Col>
              </Row>

              <Row className="mb-3">
                <Col>
                  <h6>Shipping Address</h6>
                  <div className="p-3 border rounded bg-light">
                    {selectedOrder.shipping_address || '-'}
                  </div>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col>
                  <h6>Tracking</h6>
                  {Array.isArray(selectedOrder.shipments) && selectedOrder.shipments.length > 0 ? (
                    <div className="p-3 border rounded bg-light">
                      <div className="d-flex flex-wrap gap-3 justify-content-between">
                        <div>
                          <div className="text-muted small">Courier</div>
                          <div className="fw-semibold text-uppercase">
                            {selectedOrder.shipments[0].carrier || 'BORZO'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted small">Tracking Number</div>
                          <div className="fw-semibold">
                            {selectedOrder.shipments[0].tracking_number || '-'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted small">Courier Status</div>
                          <div className="fw-semibold text-capitalize">
                            {selectedOrder.shipments[0].status || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 border rounded bg-light text-muted small">
                      Tracking details will appear once your shipment is created.
                    </div>
                  )}
                </Col>
              </Row>

              {selectedOrder.notes && (
                <Row className="mb-3">
                  <Col>
                    <h6>Notes</h6>
                    <div className="p-3 border rounded bg-light">
                      {selectedOrder.notes}
                    </div>
                  </Col>
                </Row>
              )}

              <Row>
                <Col>
                  <h6>Items</h6>
                  <div className="table-responsive">
                    <Table striped hover size="sm" className="align-middle">
                      <thead>
                        <tr>
                          <th>Image</th>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Price (₹)</th>
                          <th>Total (₹)</th>
                          <th>Review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                          selectedOrder.items.map((item) => {
                            const price = Number(item.price || 0);
                            const qty = Number(item.quantity || 0);
                            let imageUrl = null;
                            const product = item.product;
                            if (product && Array.isArray(product.images) && product.images.length > 0) {
                              const primaryImage =
                                product.images.find((img) => img.is_primary) || product.images[0];
                              if (primaryImage && primaryImage.image_url) {
                                imageUrl = buildImageUrl(primaryImage.image_url);
                              }
                            }
                            return (
                              <tr key={item.id}>
                                <td>
                                  {imageUrl && (
                                    <img
                                      src={imageUrl}
                                      alt={item.product_name || 'Product'}
                                      style={{
                                        width: 40,
                                        height: 40,
                                        objectFit: 'cover',
                                        borderRadius: 4,
                                      }}
                                    />
                                  )}
                                </td>
                                <td>{item.product_name || 'Product'}</td>
                                <td>{qty}</td>
                                <td>{price.toFixed(2)}</td>
                                <td>{(price * qty).toFixed(2)}</td>
                                <td>
                                  {selectedOrder.status === 'delivered' ? (
                                    <Button
                                      variant="outline-warning"
                                      size="sm"
                                      onClick={() => openReview(item)}
                                    >
                                      Write Review
                                    </Button>
                                  ) : (
                                    <span className="text-muted small">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={6} className="text-center text-muted">
                              No items found for this order.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                </Col>
              </Row>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {selectedOrder && selectedOrder.status === 'delivered' && (
            <Button variant="outline-primary" onClick={() => openInvoice(selectedOrder.id)}>
              Invoice
            </Button>
          )}
          {selectedOrder &&
            selectedOrder.status !== 'delivered' &&
            selectedOrder.status !== 'cancelled' && (
              <Button
                variant="outline-danger"
                onClick={() => handleCancelOrder(selectedOrder.id)}
              >
                Cancel Order
              </Button>
            )}
          <Button variant="secondary" onClick={closeDetails}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showReviewModal} onHide={closeReview} centered>
        <Modal.Header closeButton={!reviewSubmitting}>
          <Modal.Title>
            Write Review{reviewProduct?.name ? `: ${reviewProduct.name}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {reviewMessage && <Alert variant="success" className="py-2">{reviewMessage}</Alert>}
          {reviewError && <Alert variant="danger" className="py-2">{reviewError}</Alert>}

          <div className="mb-3">
            <label className="form-label">Rating</label>
            <select
              className="form-select"
              value={reviewRating}
              disabled={reviewSubmitting}
              onChange={(e) => setReviewRating(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Comment</label>
            <textarea
              className="form-control"
              rows={4}
              value={reviewComment}
              disabled={reviewSubmitting}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Write your review..."
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeReview} disabled={reviewSubmitting}>
            Cancel
          </Button>
          <Button variant="warning" onClick={submitReview} disabled={reviewSubmitting}>
            {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showReturnModal} onHide={closeReturn} centered>
        <Modal.Header closeButton={!returnSubmitting}>
          <Modal.Title>Request Return</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {returnError && <Alert variant="danger" className="py-2">{returnError}</Alert>}
          {returnSuccess && <Alert variant="success" className="py-2">{returnSuccess}</Alert>}

          <div className="mb-2 small text-muted">
            Order ID:{' '}
            <span className="fw-semibold">
              {returnOrder?.display_order_id || returnOrder?.public_id || returnOrder?.id || '-'}
            </span>
          </div>
          <div className="mb-3">
            <label className="form-label">Reason</label>
            <select
              className="form-select"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              disabled={returnSubmitting}
            >
              <option value="">Select a reason</option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Message (optional)</label>
            <textarea
              className="form-control"
              rows={3}
              value={returnMessage}
              onChange={(e) => setReturnMessage(e.target.value)}
              disabled={returnSubmitting}
              placeholder="Add more details..."
            />
          </div>
          <div className="mb-1">
            <label className="form-label">Upload Photos / Proof (optional)</label>
            <input
              type="file"
              className="form-control"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setReturnPhotos(e.target.files)}
              disabled={returnSubmitting}
            />
            <div className="small text-muted mt-1">Max 5 files. Images or PDF.</div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeReturn} disabled={returnSubmitting}>
            Cancel
          </Button>
          <Button variant="warning" onClick={submitReturnRequest} disabled={returnSubmitting}>
            {returnSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Orders;
