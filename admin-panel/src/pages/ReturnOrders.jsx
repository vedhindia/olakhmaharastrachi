import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { toast } from 'react-toastify';
import { Container, Card, Table, Badge, Button, Modal, Form } from 'react-bootstrap';
import PaginationComponent from '../components/PaginationComponent';
import { Eye } from 'lucide-react';

const ReturnOrders = () => {
  const resolveUploadsBaseUrl = () => {
    const base = api?.defaults?.baseURL;
    if (!base || typeof base !== 'string') return '';
    return base.replace(/\/api\/?$/, '');
  };

  const uploadsBaseUrl = resolveUploadsBaseUrl();

  const buildUploadUrl = (filename) => {
    if (!filename) return '';
    const safeName = encodeURIComponent(String(filename));
    if (!uploadsBaseUrl) return `/api/uploads/${safeName}`;
    return `${uploadsBaseUrl}/api/uploads/${safeName}`;
  };

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [adminStatus, setAdminStatus] = useState('requested');
  const [adminNote, setAdminNote] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailing, setEmailing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/returns/admin', { params });
      setRequests(Array.isArray(res.data?.requests) ? res.data.requests : []);
      setTotalPages(res.data?.totalPages || 1);
      if (page > (res.data?.totalPages || 1)) setPage(1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load return requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [page, statusFilter]);

  const openDetails = (row) => {
    setSelected(row);
    setAdminStatus(row?.status || 'requested');
    setAdminNote(row?.admin_note || '');
    setShowDetails(true);
  };

  const closeDetails = () => {
    if (updating) return;
    setShowDetails(false);
    setSelected(null);
    setAdminNote('');
    setAdminStatus('requested');
  };

  const openEmail = () => {
    if (!selected) return;
    const order = selected?.order || {};
    const customer = selected?.customer || {};
    const publicId = order.display_order_id || order.public_id || order.id || selected.order_id || '';
    const name = customer?.name || 'Customer';
    setEmailSubject(publicId ? `Return Request Update (Order ${publicId})` : 'Return Request Update');
    setEmailMessage(`Hello ${name},\n\n`);
    setShowEmail(true);
  };

  const closeEmail = () => {
    if (emailing) return;
    setShowEmail(false);
    setEmailSubject('');
    setEmailMessage('');
  };

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'requested') return 'warning';
    if (s === 'approved') return 'primary';
    if (s === 'picked_up') return 'info';
    if (s === 'refunded') return 'success';
    if (s === 'closed') return 'secondary';
    if (s === 'rejected') return 'danger';
    return 'secondary';
  };

  const safePhotos = useMemo(() => {
    const list = selected?.photos;
    if (Array.isArray(list)) return list;
    return [];
  }, [selected]);

  const updateStatus = async () => {
    if (!selected?.id) return;
    setUpdating(true);
    try {
      await api.put(`/returns/admin/${selected.id}/status`, {
        status: adminStatus,
        admin_note: adminNote || null,
      });
      toast.success('Return request updated');
      closeDetails();
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update return request');
    } finally {
      setUpdating(false);
    }
  };

  const sendEmail = async () => {
    if (!selected?.id) return;
    const customer = selected?.customer || {};
    if (!customer?.email) {
      toast.error('Customer email is not available');
      return;
    }
    const subject = String(emailSubject || '').trim();
    const message = String(emailMessage || '').trim();
    if (!subject) {
      toast.error('Subject is required');
      return;
    }
    if (!message) {
      toast.error('Message is required');
      return;
    }

    setEmailing(true);
    try {
      const res = await api.post(`/returns/admin/${selected.id}/email`, {
        subject,
        message,
      });
      toast.success(res.data?.message || 'Email sent');
      closeEmail();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send email');
    } finally {
      setEmailing(false);
    }
  };

  return (
    <Layout>
      <Container fluid className="p-4">
        <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
          <h2 className="mb-0">Return Orders</h2>
        </div>

        <Card className="shadow-sm border-0 rounded-3 mb-3">
          <Card.Body>
            <Form>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <div className="text-muted small">Status</div>
                <Form.Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ width: 220 }}
                >
                  <option value="">All</option>
                  <option value="requested">Requested</option>
                  <option value="approved">Approved</option>
                  <option value="picked_up">Picked up</option>
                  <option value="refunded">Refunded</option>
                  <option value="rejected">Rejected</option>
                  <option value="closed">Closed</option>
                </Form.Select>
              </div>
            </Form>
          </Card.Body>
        </Card>

        <Card className="shadow-sm border-0 rounded-3">
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="mb-0 align-middle">
                <thead className="bg-light text-uppercase small text-muted">
                  <tr>
                    <th className="px-4 py-3 border-0">#</th>
                    <th className="px-4 py-3 border-0">Order</th>
                    <th className="px-4 py-3 border-0">Customer</th>
                    <th className="px-4 py-3 border-0">Reason</th>
                    <th className="px-4 py-3 border-0">Status</th>
                    <th className="px-4 py-3 border-0">Date</th>
                    <th className="px-4 py-3 border-0 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="text-center py-5 text-muted">
                        Loading...
                      </td>
                    </tr>
                  ) : requests.length > 0 ? (
                    requests.map((r, idx) => {
                      const created = r.created_at || r.createdAt;
                      const dateStr = created ? new Date(created).toLocaleString() : '-';
                      const customer = r.customer || {};
                      const order = r.order || {};
                      const publicId = order.display_order_id || order.public_id || order.id || r.order_id;
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-3 text-muted">{(page - 1) * 10 + idx + 1}</td>
                          <td className="px-4 py-3 fw-semibold">{publicId || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-dark">{customer.name || '-'}</div>
                            <div className="text-muted small">{customer.email || customer.phone || '-'}</div>
                          </td>
                          <td className="px-4 py-3">{r.reason || '-'}</td>
                          <td className="px-4 py-3">
                            <Badge bg={statusBadge(r.status)} pill className="text-uppercase">
                              {String(r.status || '').replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted">{dateStr}</td>
                          <td className="px-4 py-3 text-end">
                            <Button variant="light" size="sm" onClick={() => openDetails(r)}>
                              <Eye size={16} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center py-5 text-muted">
                        No return requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>

        {totalPages > 1 && (
          <div className="d-flex justify-content-center mt-3 mb-3">
            <PaginationComponent currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}

        <Modal show={showDetails} onHide={closeDetails} size="lg" centered>
          <Modal.Header closeButton={!updating}>
            <Modal.Title>Return Request Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {!selected ? null : (
              <>
                <div className="mb-3">
                  <div className="fw-semibold">Reason</div>
                  <div className="text-muted">{selected.reason || '-'}</div>
                </div>
                {selected.message ? (
                  <div className="mb-3">
                    <div className="fw-semibold">Message</div>
                    <div className="text-muted">{selected.message}</div>
                  </div>
                ) : null}

                <div className="mb-3">
                  <div className="fw-semibold">Order</div>
                  <div className="text-muted">Order ID: {selected.order?.id || selected.order_id || '-'}</div>
                  <div className="text-muted text-capitalize">Order Status: {selected.order?.status || '-'}</div>
                </div>

                <div className="mb-3">
                  <div className="fw-semibold">Customer</div>
                  <div className="text-muted">
                    {selected.customer?.name || '-'} • {selected.customer?.email || selected.customer?.phone || '-'}
                  </div>
                </div>

                {Array.isArray(selected.order?.items) && selected.order.items.length > 0 ? (
                  <div className="mb-3">
                    <div className="fw-semibold mb-2">Products</div>
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="text-end">Qty</th>
                            <th className="text-end">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.order.items.map((it) => (
                            <tr key={it.id}>
                              <td>{it.product?.name || it.product_name || `#${it.product_id}`}</td>
                              <td className="text-end">{it.quantity || 0}</td>
                              <td className="text-end">₹{Number(it.price || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {safePhotos.length > 0 ? (
                  <div className="mb-3">
                    <div className="fw-semibold mb-2">Photos / Proof</div>
                    {safePhotos.map((p, idx) => {
                      const filename = p?.filename;
                      if (!filename) return null;
                      const url = buildUploadUrl(filename);
                      const label = p?.originalName || filename;
                      return (
                        <div key={`${filename}-${idx}`}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {label}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="border-top pt-3">
                  <div className="fw-semibold mb-2">Admin Action</div>
                  <Form.Group className="mb-2">
                    <Form.Label className="text-muted small">Status</Form.Label>
                    <Form.Select value={adminStatus} onChange={(e) => setAdminStatus(e.target.value)} disabled={updating}>
                      <option value="requested">Requested</option>
                      <option value="approved">Approved</option>
                      <option value="picked_up">Picked up</option>
                      <option value="refunded">Refunded</option>
                      <option value="rejected">Rejected</option>
                      <option value="closed">Closed</option>
                    </Form.Select>
                  </Form.Group>
                  <Form.Group className="mb-0">
                    <Form.Label className="text-muted small">Admin Note</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      disabled={updating}
                    />
                  </Form.Group>
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={openEmail} disabled={updating || !selected}>
              Email Customer
            </Button>
            <Button variant="secondary" onClick={closeDetails} disabled={updating}>
              Close
            </Button>
            <Button variant="primary" onClick={updateStatus} disabled={updating || !selected}>
              {updating ? 'Saving...' : 'Save'}
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showEmail} onHide={closeEmail} centered>
          <Modal.Header closeButton={!emailing}>
            <Modal.Title>Email Customer</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">
              To: <span className="fw-semibold">{selected?.customer?.email || '-'}</span>
            </div>
            <Form.Group className="mb-3">
              <Form.Label>Subject</Form.Label>
              <Form.Control
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={emailing}
              />
            </Form.Group>
            <Form.Group className="mb-0">
              <Form.Label>Message</Form.Label>
              <Form.Control
                as="textarea"
                rows={6}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                disabled={emailing}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeEmail} disabled={emailing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={sendEmail} disabled={emailing}>
              {emailing ? 'Sending...' : 'Send Email'}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </Layout>
  );
};

export default ReturnOrders;
