import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import { Container, Row, Col, Card, Spinner, Table, Badge, Modal, Button, Nav } from 'react-bootstrap';
import { ShoppingBag, Users, Layers, TrendingUp, ShoppingCart, Briefcase } from 'lucide-react';
import { toast } from 'react-toastify';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalCategories: 0,
    totalUsers: 0,
    totalWholesalers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    lowStockCount: 0,
    recentOrders: []
  });
  const [loading, setLoading] = useState(true);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState('');
  const [revenueData, setRevenueData] = useState(null);
  const [revenueTab, setRevenueTab] = useState('all');
  const lowStockSignatureRef = useRef('');
  const LOW_STOCK_TOAST_ID = 'admin:low-stock';
  const LOW_STOCK_THRESHOLD = 10;

  const refreshLowStock = useCallback(async () => {
    try {
      const resp = await api.get('/products/admin/low-stock', {
        params: { threshold: LOW_STOCK_THRESHOLD },
      });
      const lowStockProducts = Array.isArray(resp.data?.products) ? resp.data.products : [];

      if (lowStockProducts.length === 0) {
        toast.dismiss(LOW_STOCK_TOAST_ID);
        lowStockSignatureRef.current = '';
        return;
      }

      const signature = lowStockProducts
        .map((p) => `${p.id}:${p.stock}`)
        .join('|');

      if (signature === lowStockSignatureRef.current && toast.isActive(LOW_STOCK_TOAST_ID)) {
        return;
      }
      lowStockSignatureRef.current = signature;

      const shown = lowStockProducts.slice(0, 8);
      const remaining = lowStockProducts.length - shown.length;
      const content = (
        <div>
          <div className="fw-bold mb-1">Low stock alert (below {LOW_STOCK_THRESHOLD})</div>
          <div className="small">
            {shown.map((p, idx) => (
              <div key={p.id || idx}>
                {p.name || 'Product'} {p.sku ? `(${p.sku})` : ''} — Stock: {p.stock ?? '-'}
              </div>
            ))}
            {remaining > 0 && <div className="mt-1">and {remaining} more…</div>}
            <div className="mt-2">Please add stock. This alert will auto-remove once stock is updated.</div>
          </div>
        </div>
      );

      if (toast.isActive(LOW_STOCK_TOAST_ID)) {
        toast.update(LOW_STOCK_TOAST_ID, { render: content, type: toast.TYPE.WARNING, autoClose: false });
      } else {
        toast.warning(content, {
          toastId: LOW_STOCK_TOAST_ID,
          autoClose: false,
          closeOnClick: false,
          draggable: true,
        });
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    refreshLowStock();
    const timer = setInterval(refreshLowStock, 30000);
    return () => clearInterval(timer);
  }, [refreshLowStock]);

  const formatMoney = (amount) => {
    const n = Number(amount || 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `₹${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const openRevenueModal = async () => {
    setShowRevenueModal(true);
    if (revenueData || revenueLoading) return;
    setRevenueLoading(true);
    setRevenueError('');
    try {
      const response = await api.get('/dashboard/revenue-breakdown', { params: { limit: 50 } });
      setRevenueData(response.data);
    } catch (error) {
      setRevenueError(error.response?.data?.message || 'Failed to load payment history');
    } finally {
      setRevenueLoading(false);
    }
  };

  const closeRevenueModal = () => {
    setShowRevenueModal(false);
    setRevenueTab('all');
  };

  const allRevenueOrders = useMemo(() => {
    const online = Array.isArray(revenueData?.online?.orders) ? revenueData.online.orders : [];
    const cod = Array.isArray(revenueData?.cod?.orders) ? revenueData.cod.orders : [];
    const merged = [...online, ...cod];
    merged.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
    return merged;
  }, [revenueData]);

  const revenueOrdersToShow = useMemo(() => {
    if (revenueTab === 'online') return Array.isArray(revenueData?.online?.orders) ? revenueData.online.orders : [];
    if (revenueTab === 'cod') return Array.isArray(revenueData?.cod?.orders) ? revenueData.cod.orders : [];
    return allRevenueOrders;
  }, [allRevenueOrders, revenueData, revenueTab]);

  const isCodMethod = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return false;
    if (v === 'cod') return true;
    if (v.includes('cash') && v.includes('delivery')) return true;
    if (v.includes('cash_on_delivery')) return true;
    return false;
  };

  if (loading) {
    return (
      <Layout>
        <Container fluid className="p-4 d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
            <Spinner animation="border" variant="primary" />
        </Container>
      </Layout>
    );
  }

  const StatCard = ({ title, value, icon: Icon, color, link, subValue, onClick }) => (
    <Card 
      className="shadow-sm h-100 border-0 rounded-4"
      onClick={() => (onClick ? onClick() : link ? navigate(link) : null)} 
      style={{
        cursor: link || onClick ? 'pointer' : 'default',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={(e) => {
        if (!link && !onClick) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.classList.add('shadow');
      }}
      onMouseLeave={(e) => {
        if (!link && !onClick) return;
        e.currentTarget.style.transform = '';
        e.currentTarget.classList.remove('shadow');
      }}
    >
      <Card.Body className="d-flex align-items-center justify-content-between gap-3 p-4">
        <div className="d-flex align-items-center gap-3">
          <div
            className={`rounded-circle p-3 bg-${color} bg-opacity-10`}
            style={{ border: '1px solid rgba(0,0,0,0.05)' }}
          >
          <Icon size={24} className={`text-${color}`} />
        </div>
          <div>
            <div className="text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>
              {title}
            </div>
            <div className="fs-3 fw-bold text-dark lh-sm">{value}</div>
          {subValue && <small className="text-muted">{subValue}</small>}
          </div>
        </div>
        
      </Card.Body>
    </Card>
  );

  return (
    <Layout>
      <Container fluid className="p-4">
        <div className="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-4">
          <div>
            <h2 className="mb-1 fw-bold text-dark">Dashboard</h2>
            <div className="text-muted small">Overview of your store activity</div>
          </div>
        </div>
        
        <Row className="g-4 mb-5">
          <Col md={4} sm={6}>
            <StatCard 
              title="Total Revenue" 
              value={`₹${stats.totalRevenue.toLocaleString()}`} 
              icon={TrendingUp} 
              color="success" 
              onClick={openRevenueModal}
              subValue="Tap to view payment history"
            />
          </Col>
          <Col md={4} sm={6}>
            <StatCard 
              title="Total Orders" 
              value={stats.totalOrders} 
              icon={ShoppingCart} 
              color="primary" 
              link="/orders"
            />
          </Col>
          <Col md={4} sm={6}>
            <StatCard 
              title="Products" 
              value={stats.totalProducts} 
              icon={ShoppingBag} 
              color="info" 
              link="/products"
            />
          </Col>
        </Row>

        {/* Stats Row 2 */}
        <Row className="g-4 mb-5">
           <Col md={4} sm={6}>
            <StatCard 
              title="Categories" 
              value={stats.totalCategories} 
              icon={Layers} 
              color="secondary" 
              link="/categories"
            />
          </Col>
          <Col md={4} sm={6}>
            <StatCard 
              title="Customers" 
              value={stats.totalUsers} 
              icon={Users} 
              color="warning" 
              link="/users"
            />
          </Col>
          <Col md={4} sm={6}>
            <StatCard 
              title="Wholesalers" 
              value={stats.totalWholesalers} 
              icon={Briefcase} 
              color="dark" 
              link="/wholesalers"
            />
          </Col>
        </Row>

        {/* Recent Orders Section */}
        <div className="mt-4">
          
          <Card className="shadow-sm border-0 rounded-4 overflow-hidden">
             <Card.Header className="bg-white d-flex justify-content-between align-items-center py-3 px-4 border-0">
               <div>
                 <div className="fw-bold text-dark">Recent Orders</div>
                 <div className="text-muted small">Latest orders placed in your store</div>
               </div>
               <button className="btn btn-outline-primary btn-sm" onClick={() => navigate('/orders')}>View All</button>
             </Card.Header>
             <Card.Body className="p-0">
               <div className="table-responsive">
                 <Table hover className="mb-0 align-middle">
                   <thead className="bg-light">
                     <tr>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>#</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Order</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Customer</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Amount</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Status</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Payment</th>
                       <th className="border-0 px-4 py-3 text-muted small text-uppercase text-end" style={{ letterSpacing: '0.04em' }}>Date</th>
                     </tr>
                   </thead>
                   <tbody>
                     {stats.recentOrders && stats.recentOrders.length > 0 ? (
                       stats.recentOrders.map((order, index) => (
                         <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/orders')}>
                           <td className="px-4 text-muted">{index + 1}</td>
                           <td className="px-4 fw-semibold text-dark">{order.display_order_id || order.public_id || `#${order.id}`}</td>
                           <td className="px-4">
                             {order.customer ? order.customer.name : (order.wholesaler ? order.wholesaler.business_name : 'Unknown')}
                           </td>
                           <td className="px-4 fw-bold text-dark">₹{Number(order.total_amount || 0).toFixed(2)}</td>
                           <td className="px-4">
                             <Badge bg={
                               order.status === 'delivered' ? 'success' : 
                               order.status === 'cancelled' ? 'danger' : 
                               order.status === 'shipped' ? 'info' : 'warning'
                             }>
                               {String(order.status || '').toLowerCase()}
                             </Badge>
                           </td>
                            <td className="px-4">
                             <Badge bg={order.payment_status === 'paid' ? 'success' : 'secondary'} pill>
                               {String(order.payment_status || '').toLowerCase()}
                             </Badge>
                           </td>
                           <td className="px-4 text-muted text-end">{new Date(order.created_at).toLocaleDateString()}</td>
                         </tr>
                       ))
                     ) : (
                       <tr>
                         <td colSpan="7" className="text-center py-5 text-muted">No recent orders found.</td>
                       </tr>
                     )}
                   </tbody>
                 </Table>
               </div>
             </Card.Body>
          </Card>
        </div>

        <Modal show={showRevenueModal} onHide={closeRevenueModal} size="xl" centered>
          <Modal.Header closeButton className="border-0 pb-0">
            <div>
              <Modal.Title className="fw-bold">Payment History</Modal.Title>
              <div className="text-muted small">
                Online revenue counts paid orders. COD revenue counts delivered orders (after Borzo marks delivered).
              </div>
            </div>
          </Modal.Header>
          <Modal.Body className="pt-3">
            {revenueLoading ? (
              <div className="d-flex justify-content-center align-items-center py-5">
                <Spinner animation="border" variant="primary" />
              </div>
            ) : revenueError ? (
              <div className="text-danger">{revenueError}</div>
            ) : (
              <>
                <Row className="g-3 mb-3">
                  <Col lg={4} md={6}>
                    <Card className="border-0 shadow-sm rounded-4 h-100">
                      <Card.Body className="p-3">
                        <div className="text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>
                          Total Revenue
                        </div>
                        <div className="fs-3 fw-bold text-dark lh-sm">
                          {formatMoney(revenueData?.totalRevenue ?? stats.totalRevenue)}
                        </div>
                        <div className="text-muted small">
                          Online + COD combined
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col lg={4} md={6}>
                    <Card className="border-0 shadow-sm rounded-4 h-100">
                      <Card.Body className="p-3">
                        <div className="text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>
                          Online Payments
                        </div>
                        <div className="fs-3 fw-bold text-dark lh-sm">
                          {formatMoney(revenueData?.online?.revenue)}
                        </div>
                        <div className="text-muted small">
                          Orders: {Number(revenueData?.online?.count || 0)}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col lg={4} md={12}>
                    <Card className="border-0 shadow-sm rounded-4 h-100">
                      <Card.Body className="p-3">
                        <div className="text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>
                          Cash on Delivery
                        </div>
                        <div className="fs-3 fw-bold text-dark lh-sm">
                          {formatMoney(revenueData?.cod?.revenue)}
                        </div>
                        <div className="text-muted small">
                          Orders: {Number(revenueData?.cod?.count || 0)}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                  <Nav variant="pills" activeKey={revenueTab} onSelect={(k) => k && setRevenueTab(k)}>
                    <Nav.Item>
                      <Nav.Link eventKey="all">All</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="online">Online</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="cod">COD</Nav.Link>
                    </Nav.Item>
                  </Nav>
                  <div className="text-muted small">
                    Showing {revenueOrdersToShow.length} orders
                  </div>
                </div>

                <div className="table-responsive">
                  <Table hover className="mb-0 align-middle">
                    <thead className="bg-light">
                      <tr>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Order</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Customer</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Method</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Payment</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase" style={{ letterSpacing: '0.04em' }}>Status</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase text-end" style={{ letterSpacing: '0.04em' }}>Amount</th>
                        <th className="border-0 px-3 py-3 text-muted small text-uppercase text-end" style={{ letterSpacing: '0.04em' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueOrdersToShow.length ? (
                        revenueOrdersToShow.map((order) => {
                          const customerName =
                            order.customer?.name ||
                            order.wholesaler?.business_name ||
                            'Unknown';
                          const cod = isCodMethod(order.payment_method);
                          const methodLabel = cod ? 'COD' : 'Online';
                          const methodVariant = cod ? 'secondary' : 'primary';
                          const payStatus = String(order.payment_status || '').toLowerCase();
                          const orderStatus = String(order.status || '').toLowerCase();
                          return (
                            <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/orders')}>
                              <td className="px-3 fw-semibold text-dark">
                                {order.display_order_id || order.public_id || `#${order.id}`}
                              </td>
                              <td className="px-3">{customerName}</td>
                              <td className="px-3">
                                <Badge bg={methodVariant} pill>
                                  {methodLabel}
                                </Badge>
                              </td>
                              <td className="px-3">
                                <Badge bg={payStatus === 'paid' ? 'success' : 'secondary'} pill>
                                  {payStatus || 'pending'}
                                </Badge>
                              </td>
                              <td className="px-3">
                                <Badge
                                  bg={
                                    orderStatus === 'delivered'
                                      ? 'success'
                                      : orderStatus === 'cancelled'
                                        ? 'danger'
                                        : orderStatus === 'shipped'
                                          ? 'info'
                                          : 'warning'
                                  }
                                >
                                  {orderStatus || '-'}
                                </Badge>
                              </td>
                              <td className="px-3 text-end fw-bold text-dark">
                                {formatMoney(order.total_amount)}
                              </td>
                              <td className="px-3 text-end text-muted">
                                {order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-center py-5 text-muted">
                            No payment history found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0">
            <Button variant="outline-secondary" onClick={closeRevenueModal}>
              Close
            </Button>
            <Button variant="primary" onClick={() => navigate('/orders')}>
              View All Orders
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </Layout>
  );
};

export default Dashboard;
