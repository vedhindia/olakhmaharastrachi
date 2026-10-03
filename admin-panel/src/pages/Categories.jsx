import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { toast } from 'react-toastify';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import PaginationComponent from '../components/PaginationComponent';

const buildCategoryImageUrl = (imageValue) => {
  if (!imageValue) return null;
  const raw = String(imageValue);
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

  const normalized = raw.replace(/\\/g, '/');
  const baseName = normalized.split('/').filter(Boolean).pop();
  if (!baseName) return null;

  if (import.meta.env.DEV) {
    return `http://localhost:5000/uploads/${baseName}`;
  }
  return `/api/uploads/${baseName}`;
};

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [formData, setFormData] = useState({ category_name: '', slug: '', status: true, image: null, variant_type: 'none' });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCategories = async (query = '', page = 1) => {
    try {
      setLoading(true);
      const response = await api.get('/categories', { params: { search: query, page, limit: 10 } });
      setCategories(response.data.categories);
      setTotalPages(response.data.totalPages);
      setCurrentPage(response.data.currentPage);
    } catch (error) {
      toast.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories(searchQuery, 1);
  }, [searchQuery]);

  const handlePageChange = (page) => {
    fetchCategories(searchQuery, page);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      try {
        await api.delete(`/categories/${id}`);
        toast.success('Category deleted');
        fetchCategories(searchQuery, currentPage);
      } catch (error) {
        toast.error('Failed to delete category');
      }
    }
  };

  const handleEdit = (category) => {
    setIsEditing(true);
    setCurrentCategory(category);
    setFormData({ 
        category_name: category.category_name,
        slug: category.slug || '',
        status: category.status,
        image: null,
        variant_type: category.variant_type || 'none'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      data.append('category_name', formData.category_name);
      data.append('slug', formData.slug);
      data.append('status', formData.status);
      data.append('variant_type', formData.variant_type || 'none');
      if (formData.image) {
        data.append('image', formData.image);
      }

      const config = {
          headers: {
              'Content-Type': 'multipart/form-data',
          },
      };

      if (isEditing) {
        await api.put(`/categories/${currentCategory.id}`, data, config);
        toast.success('Category updated');
      } else {
        await api.post('/categories', data, config);
        toast.success('Category created');
      }
      setShowModal(false);
      setFormData({ category_name: '', slug: '', status: true, image: null, variant_type: 'none' });
      setIsEditing(false);
      setCurrentCategory(null);
      fetchCategories(searchQuery, currentPage);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormData({ category_name: '', slug: '', status: true, image: null, variant_type: 'none' });
    setIsEditing(false);
    setCurrentCategory(null);
  };

  return (
    <Layout>
      <Container fluid className="p-4">
        <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
          <h2 className="mb-0">Categories</h2>
          <Button
            variant="primary"
            onClick={() => {
                setIsEditing(false);
                setFormData({ category_name: '', slug: '', status: true, image: null, variant_type: 'none' });
                setShowModal(true);
            }}
            className="d-flex align-items-center"
          >
            <Plus className="me-2" size={16} />
            Add Category
          </Button>
        </div>

        <Form className="mb-4">
            <Row>
                <Col md={8} lg={6}>
                    <div className="d-flex gap-2">
                        <Form.Control
                            type="text"
                            placeholder="Search by category name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </Col>
            </Row>
        </Form>

        {loading ? (
          <div className="text-center py-4">Loading...</div>
        ) : (
          <Card className="shadow-sm">
            <Card.Body className="p-0">
              <Table responsive hover className="mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3">Sr No.</th>
                    <th className="px-4 py-3">Image</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Variant Type</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category, index) => {
                    const vType = category.variant_type || 'none';
                    let badgeClass = 'bg-secondary';
                    let badgeLabel = 'Standard';
                    if (vType === 'weight') { badgeClass = 'bg-success'; badgeLabel = 'Weight-wise'; }
                    if (vType === 'size') { badgeClass = 'bg-primary'; badgeLabel = 'Size-wise'; }
                    return (
                    <tr key={category.id}>
                      <td className="px-4 py-3 text-muted">{(currentPage - 1) * 10 + index + 1}</td>
                      <td className="px-4 py-3">
                        {category.image ? (
                            <img
  src={buildCategoryImageUrl(category.image)}
  alt={category.category_name}
  style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
/>
                        ) : (
                            <span className="text-muted small">No Image</span>
                        )}
                      </td>
                      <td className="px-4 py-3 fw-medium">{category.category_name}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-muted">{category.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`badge bg-${category.status ? 'success' : 'danger'}`}>
                            {category.status ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="d-flex justify-content-end gap-2">
                          <OverlayTrigger placement="top" overlay={<Tooltip>Edit Category</Tooltip>}>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              className="d-flex align-items-center justify-content-center"
                              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                              onClick={() => handleEdit(category)}
                            >
                              <Edit size={16} />
                            </Button>
                          </OverlayTrigger>

                          <OverlayTrigger placement="top" overlay={<Tooltip>Delete Category</Tooltip>}>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              className="d-flex align-items-center justify-content-center"
                              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                              onClick={() => handleDelete(category.id)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </OverlayTrigger>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {categories.length === 0 && (
                      <tr>
                          <td colSpan="7" className="text-center py-4 text-muted">No categories found.</td>
                      </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}

        {totalPages > 1 && (
            <PaginationComponent 
              currentPage={currentPage} 
              totalPages={totalPages} 
              onPageChange={handlePageChange} 
            />
        )}

        <Modal show={showModal} onHide={handleCloseModal} centered backdrop="static" className="modal-with-sidebar">
          <Modal.Header closeButton>
            <Modal.Title>{isEditing ? 'Edit Category' : 'Add Category'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form id="category-form" onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Category Name</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.category_name}
                  onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Slug (Optional - Auto-generated)</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="Leave empty to auto-generate"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Category Image</Form.Label>
                <Form.Control
                  type="file"
                  onChange={(e) => setFormData({ ...formData, image: e.target.files[0] })}
                  accept="image/*"
                />
              </Form.Group>
              <div className="mb-3 p-3 bg-light rounded border">
                <Form.Label className="fw-semibold d-block mb-2">Product Variant System <small className="text-muted fw-normal">(Choose at most one)</small></Form.Label>
                <div className="d-flex flex-wrap gap-4">
                  <Form.Check 
                    type="checkbox" 
                    label="Weight-wise (100g, 500g, 1kg etc.)" 
                    checked={formData.variant_type === 'weight'}
                    onChange={(e) => {
                      const newChecked = e.target.checked;
                      setFormData({ ...formData, variant_type: newChecked ? 'weight' : 'none' });
                    }}
                  />
                  <Form.Check 
                    type="checkbox" 
                    label="Size-wise (S, M, L, XL etc.)" 
                    checked={formData.variant_type === 'size'}
                    onChange={(e) => {
                      const newChecked = e.target.checked;
                      setFormData({ ...formData, variant_type: newChecked ? 'size' : 'none' });
                    }}
                  />
                </div>
                <div className="form-text text-muted mt-2">
                  Both unchecked = standard product (no variant options shown to customer).
                </div>
              </div>
              <Form.Group className="mb-3">
                <Form.Check 
                  type="checkbox" 
                  label="Active Status" 
                  checked={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                />
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="category-form">
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </Layout>
  );
};

export default Categories;
