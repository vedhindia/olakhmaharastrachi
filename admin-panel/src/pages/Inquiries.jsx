import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { Table, Button, Modal, Badge, Form } from 'react-bootstrap';
import PaginationComponent from '../components/PaginationComponent';
import { Eye, RefreshCw, Send, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

const INQUIRIES_LAST_SEEN_KEY = 'admin:lastSeen:inquiries';

const Inquiries = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showReply, setShowReply] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyForm, setReplyForm] = useState({ subject: '', message: '' });
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', message: '' });
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const markSeenNow = () => {
    const now = Date.now();
    localStorage.setItem(INQUIRIES_LAST_SEEN_KEY, String(now));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('admin:inquiries-seen'));
    }
  };

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/communications/admin', {
        params: {
          source: 'contact_form',
          channel: 'email',
          page,
          limit: 10,
        },
      });
      setLogs(res.data.logs || []);
      setTotalPages(res.data.totalPages || 1);
      if (page > (res.data.totalPages || 1)) setPage(1);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    markSeenNow();
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [page]);

  const openDetails = (row) => {
    setSelected(row);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelected(null);
  };

  const parseMeta = (meta) => {
    if (meta && typeof meta === 'object') return meta;
    if (typeof meta === 'string') {
      try {
        const parsed = JSON.parse(meta);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
    return {};
  };

  const extractFromMessage = (message) => {
    const text = String(message || '');
    const nameMatch = text.match(/^\s*Name:\s*(.+)\s*$/m);
    const emailMatch = text.match(/^\s*Email:\s*(.+)\s*$/m);
    return {
      name: nameMatch ? String(nameMatch[1]).trim() : '',
      email: emailMatch ? String(emailMatch[1]).trim() : '',
    };
  };

  const safeMeta = (row) => {
    const meta = parseMeta(row?.meta);
    const fromMsg = extractFromMessage(row?.message);
    return {
      ...meta,
      name: meta?.name || fromMsg.name || '',
      email: meta?.email || fromMsg.email || '',
    };
  };

  const actionBtnClass = useMemo(() => 'px-2 py-1 d-inline-flex align-items-center justify-content-center', []);

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return String(iso || '');
    }
  };

  const openReply = (row) => {
    const email = safeMeta(row)?.email || '';
    setReplyTarget(row);
    setReplyForm({
      subject: row?.subject ? `Re: ${row.subject}` : 'Re: Your enquiry',
      message: '',
    });
    if (!email) toast.warning('Customer email not found for this inquiry');
    setShowReply(true);
  };

  const closeReply = () => {
    setShowReply(false);
    setReplying(false);
    setReplyTarget(null);
    setReplyForm({ subject: '', message: '' });
  };

  const sendReply = async () => {
    if (!replyTarget) return;
    const subject = String(replyForm.subject || '').trim();
    const message = String(replyForm.message || '').trim();
    if (!message) {
      toast.error('Reply message is required');
      return;
    }
    setReplying(true);
    try {
      await api.post(`/communications/admin/${replyTarget.id}/reply`, { subject, message });
      toast.success('Reply sent');
      closeReply();
      fetchInquiries();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const openEdit = (row) => {
    setEditTarget(row);
    setEditForm({
      subject: row?.subject || '',
      message: row?.message || '',
    });
    setShowEdit(true);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setEditing(false);
    setEditTarget(null);
    setEditForm({ subject: '', message: '' });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditing(true);
    try {
      await api.patch(`/communications/admin/${editTarget.id}`, {
        subject: String(editForm.subject || ''),
        message: String(editForm.message || ''),
      });
      toast.success('Inquiry updated');
      closeEdit();
      fetchInquiries();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to update inquiry');
    } finally {
      setEditing(false);
    }
  };

  const openDelete = (row) => {
    setDeleteTarget(row);
    setShowDelete(true);
  };

  const closeDelete = () => {
    setShowDelete(false);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/communications/admin/${deleteTarget.id}`);
      toast.success('Inquiry deleted');
      closeDelete();
      fetchInquiries();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to delete inquiry');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="fw-bold mb-1">Inquiries</h3>
          <div className="text-muted">Contact form enquiries received from the website</div>
        </div>
        <Button variant="outline-secondary" onClick={fetchInquiries} disabled={loading}>
          <RefreshCw size={16} className="me-2" />
          Refresh
        </Button>
      </div>

      <div className="bg-white rounded-4 shadow-sm p-3 p-md-4">
        <Table responsive hover className="align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Date</th>
              <th style={{ width: 260 }}>From</th>
              <th>Subject</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 220 }} className="text-end">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-5 text-muted">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-5 text-muted">
                  No inquiries found
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr key={row.id}>
                  <td className="text-muted">{formatDate(row.created_at)}</td>
                  <td>
                    <div className="fw-semibold">{safeMeta(row)?.name || '—'}</div>
                    <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {safeMeta(row)?.email || '—'}
                    </div>
                  </td>
                  <td className="fw-semibold">{row.subject || 'Contact form enquiry'}</td>
                  <td>
                    <Badge bg={row.status === 'sent' ? 'success' : 'danger'} className="text-uppercase">
                      {row.status || 'sent'}
                    </Badge>
                  </td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className={actionBtnClass}
                        onClick={() => openDetails(row)}
                        title="View"
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        variant="outline-success"
                        size="sm"
                        className={actionBtnClass}
                        onClick={() => openReply(row)}
                        title="Reply"
                      >
                        <Send size={16} />
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        className={actionBtnClass}
                        onClick={() => openEdit(row)}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        className={actionBtnClass}
                        onClick={() => openDelete(row)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <div className="d-flex justify-content-center mt-4">
          <PaginationComponent currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      <Modal show={showDetails} onHide={closeDetails} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Inquiry Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-2">
            <div className="text-muted">Received</div>
            <div className="fw-semibold">{formatDate(selected?.created_at)}</div>
          </div>
          <div className="mb-2">
            <div className="text-muted">From</div>
            <div className="fw-semibold">{safeMeta(selected)?.name || '—'}</div>
            <div className="text-muted">{safeMeta(selected)?.email || '—'}</div>
          </div>
          <div className="mb-2">
            <div className="text-muted">Subject</div>
            <div className="fw-semibold">{selected?.subject || 'Contact form enquiry'}</div>
          </div>
          <div className="mb-2">
            <div className="text-muted">Status</div>
            <Badge bg={selected?.status === 'sent' ? 'success' : 'danger'} className="text-uppercase">
              {selected?.status || 'sent'}
            </Badge>
          </div>
          <div className="mt-3">
            <div className="text-muted">Message</div>
            <pre className="bg-light rounded-3 p-3 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {selected?.message || ''}
            </pre>
          </div>
        </Modal.Body>
      </Modal>

      <Modal show={showReply} onHide={closeReply} centered>
        <Modal.Header closeButton>
          <Modal.Title>Reply to Inquiry</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <div className="text-muted">To</div>
            <div className="fw-semibold">{safeMeta(replyTarget)?.email || '—'}</div>
          </div>
          <Form.Group className="mb-3">
            <Form.Label>Subject</Form.Label>
            <Form.Control
              type="text"
              value={replyForm.subject}
              onChange={(e) => setReplyForm((p) => ({ ...p, subject: e.target.value }))}
              disabled={replying}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Message</Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              value={replyForm.message}
              onChange={(e) => setReplyForm((p) => ({ ...p, message: e.target.value }))}
              disabled={replying}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeReply} disabled={replying}>
            Cancel
          </Button>
          <Button variant="success" onClick={sendReply} disabled={replying}>
            {replying ? 'Sending…' : 'Send Reply'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showEdit} onHide={closeEdit} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Edit Inquiry</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Subject</Form.Label>
            <Form.Control
              type="text"
              value={editForm.subject}
              onChange={(e) => setEditForm((p) => ({ ...p, subject: e.target.value }))}
              disabled={editing}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Message</Form.Label>
            <Form.Control
              as="textarea"
              rows={10}
              value={editForm.message}
              onChange={(e) => setEditForm((p) => ({ ...p, message: e.target.value }))}
              disabled={editing}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeEdit} disabled={editing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveEdit} disabled={editing}>
            {editing ? 'Saving…' : 'Save'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDelete} onHide={closeDelete} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Inquiry</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-2">Are you sure you want to delete this inquiry?</div>
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>
            {deleteTarget?.subject || 'Contact form enquiry'}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeDelete} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Layout>
  );
};

export default Inquiries;
