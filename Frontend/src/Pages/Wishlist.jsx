import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Alert, Button, Table, Pagination, Badge } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, X, Heart } from 'lucide-react';
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

const getWishlistStorageKey = () => {
  if (typeof localStorage === 'undefined') return 'wishlistIds';
  const wholesalerToken = localStorage.getItem('wholesalerToken');
  const userToken = localStorage.getItem('userToken');
  if (wholesalerToken) return 'wishlistIds_wholesaler';
  if (userToken) return 'wishlistIds_user';
  return 'wishlistIds';
};

const getStoredWishlistIds = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const key = getWishlistStorageKey();
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
};

const Wishlist = () => {
  const [wishlistIds, setWishlistIds] = useState(getStoredWishlistIds);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [customerType, setCustomerType] = useState('Retail Customer');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWishlistProducts = async () => {
      const token = getAuthToken();
      if (!token) {
        const msg = 'Please login as customer or wholesaler to use wishlist';
        setError(msg);
        setProducts([]);
        setCurrentPage(1);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app:toast', {
              detail: { message: msg, variant: 'danger' },
            }),
          );
        }
        return;
      }
      if (!wishlistIds.length) {
        setProducts([]);
        setCurrentPage(1);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const idsSet = new Set(
          wishlistIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0),
        );
        if (!idsSet.size) {
          setProducts([]);
          setCurrentPage(1);
          return;
        }

        const limit = 100;
        let page = 1;
        let totalPages = 1;
        const foundById = new Map();

        while (page <= totalPages && foundById.size < idsSet.size) {
          const response = await fetch(`${API_BASE}/products?limit=${limit}&page=${page}`);
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.message || 'Failed to load products');
          }
          const list = Array.isArray(data.products) ? data.products : [];
          list.forEach((p) => {
            if (p && idsSet.has(Number(p.id))) {
              foundById.set(Number(p.id), p);
            }
          });
          totalPages =
            typeof data.totalPages === 'number' && data.totalPages > 0 ? data.totalPages : 1;
          page += 1;
        }

        const ordered = wishlistIds
          .map((id) => foundById.get(Number(id)))
          .filter(Boolean);
        setProducts(ordered);
      } catch (err) {
        setError(err.message || 'Something went wrong while loading wishlist');
      } finally {
        setLoading(false);
      }
    };

    fetchWishlistProducts();
  }, [wishlistIds]);

  useEffect(() => {
    const handleWishlistUpdate = () => {
      setWishlistIds(getStoredWishlistIds());
    };
    window.addEventListener('wishlist:update', handleWishlistUpdate);
    return () => {
      window.removeEventListener('wishlist:update', handleWishlistUpdate);
    };
  }, []);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const wholesalerToken = localStorage.getItem('wholesalerToken');
    if (wholesalerToken) {
      setCustomerType('Wholesaler');
    } else {
      setCustomerType('Retail Customer');
    }
  }, []);

  const persistWishlist = (ids) => {
    setWishlistIds(ids);
    if (typeof localStorage !== 'undefined') {
      const key = getWishlistStorageKey();
      localStorage.setItem(key, JSON.stringify(ids));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('wishlist:update'));
    }
  };

  const handleRemove = (productId) => {
    setMessage('');
    setError('');
    const updated = wishlistIds.filter((id) => id !== productId);
    persistWishlist(updated);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    const msg = 'Removed from wishlist';
    setMessage(msg);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:toast', {
          detail: { message: msg, variant: 'success' },
        }),
      );
    }
  };

  const handleAddToCart = async (productId) => {
    setMessage('');
    setError('');
    const token = getAuthToken();
    if (!token) {
      setError('Please login as customer or wholesaler to add items to cart');
      return;
    }
    try {
      const responseCart = await fetch(`${API_BASE}/cart`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const dataCart = await responseCart.json();
      if (!responseCart.ok) {
        throw new Error(dataCart.message || 'Failed to load cart');
      }
      const itemsCart = dataCart && Array.isArray(dataCart.items) ? dataCart.items : [];
      const targetId = Number(productId);
      const alreadyInCart = itemsCart.some((item) => {
        const itemProductId =
          typeof item.product_id !== 'undefined'
            ? Number(item.product_id)
            : item.product && typeof item.product.id !== 'undefined'
            ? Number(item.product.id)
            : NaN;
        return !Number.isNaN(itemProductId) && itemProductId === targetId;
      });
      if (alreadyInCart) {
        const msg = 'This product is already in your cart';
        setMessage(msg);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app:toast', {
              detail: { message: msg, variant: 'info' },
            }),
          );
        }
        return;
      }
      const response = await fetch(`${API_BASE}/cart/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add item to cart');
      }
      const msg = 'Item added to cart';
      setMessage(msg);
      try {
        const countResponse = await fetch(`${API_BASE}/cart`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const countData = await countResponse.json();
        if (countResponse.ok) {
          const items = countData && Array.isArray(countData.items) ? countData.items : [];
          const count = items.length;
          const safeCount = Number.isNaN(count) || count < 0 ? 0 : count;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('cartCount', String(safeCount));
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('cart:update'));
          }
        }
      } catch (error) {
        console.error(error);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while adding to cart');
    }
  };

  const itemsPerPage = 5;
  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const indexOfLastItem = safePage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProducts = products.slice(indexOfFirstItem, indexOfLastItem);
  
  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Wishlist</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <a href="/" className='text-decoration-none text-white'>Home</a>
            <span className="dot">•</span>
            <span>Wishlist</span>
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
              <span>Loading wishlist...</span>
            </div>
          )}

          {!loading && !products.length && !error && (
            <div className="wishlist-empty text-center py-5">
              <div className="wishlist-empty-icon mb-3">
                <Heart size={36} />
              </div>
              <h3 className="mb-2">Your wishlist is empty</h3>
              <p className="text-muted mb-3">
                Browse our products and tap the heart icon to save your favourites here.
              </p>
              <Button as={Link} to="/shop" variant="success">
                Go to Shop
              </Button>
            </div>
          )}

          {!loading && products.length > 0 && (
            <Row className="justify-content-center">
              <Col lg={10}>
                <div className="wishlist-card">
                  <div className="d-flex justify-content-between align-items-center mb-3 wishlist-header">
                    <div className="wishlist-header-text">
                      <h3 className="mb-1">Your Saved Items</h3>
                      <p className="text-muted mb-0">
                        Keep products you love here and move them to cart when you are ready.
                      </p>
                    </div>
                    <div className="wishlist-header-badge">
                      <Badge bg="success" pill>
                        {totalItems} item{totalItems !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                  <div className="wishlist-table-wrapper">
                <Table responsive bordered hover className="align-middle wishlist-table wishlist-table-styled">
                  <thead>
                    <tr>
                      <th className="text-center">Images</th>
                      <th>Product</th>
                      <th className="text-center">Unit Price</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProducts.map((product) => {
                      const retailPrice = product.customer_price
                        ? Number(product.customer_price)
                        : 0;
                      const wholesalePrice = product.wholesaler_price
                        ? Number(product.wholesaler_price)
                        : 0;
                      let unitPrice = retailPrice;
                      if (typeof localStorage !== 'undefined') {
                        const userToken = localStorage.getItem('userToken');
                        const wholesalerToken = localStorage.getItem('wholesalerToken');
                        if (wholesalerToken) {
                          if (wholesalePrice > 0) {
                            unitPrice = wholesalePrice;
                          } else if (retailPrice > 0) {
                            unitPrice = retailPrice;
                          } else {
                            unitPrice = 0;
                          }
                        } else if (userToken) {
                          if (retailPrice > 0) {
                            unitPrice = retailPrice;
                          } else {
                            unitPrice = 0;
                          }
                        } else if (retailPrice > 0) {
                          unitPrice = retailPrice;
                        } else if (wholesalePrice > 0) {
                          unitPrice = wholesalePrice;
                        } else {
                          unitPrice = 0;
                        }
                      } else if (retailPrice > 0) {
                        unitPrice = retailPrice;
                      } else if (wholesalePrice > 0) {
                        unitPrice = wholesalePrice;
                      } else {
                        unitPrice = 0;
                      }
                      return (
                        <tr
                          key={product.id}
                          className="cart-row-clickable cursor-pointer"
                          onClick={() => {
                            if (product.id) {
                              navigate(`/product/${product.id}`);
                            }
                          }}
                        >
                          <td className="text-center">
                            <div className="cart-img-wrapper mx-auto">
                              <Link to={`/product/${product.id}`}>
                                <img
                                  src={
                                    product.images && product.images.length
                                      ? `${API_BASE}/${String(product.images[0].image_url).replace(/^\/+/, '')}`
                                      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23f3f3f3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="14">No Image</text></svg>'
                                  }
                                  alt={product.name}
                                  className="img-fluid"
                                />
                              </Link>
                            </div>
                          </td>
                          <td>
                            <Link
                              to={`/product/${product.id}`}
                              className="text-decoration-none text-dark"
                            >
                              <div className="fw-semibold wishlist-product-name">{product.name}</div>
                            </Link>
                            <div className="small text-muted">
                              {product.category && product.category.name
                                ? product.category.name
                                : 'CATEGORY'}
                            </div>
                          </td>
                          <td className="text-center">
                            ₹{unitPrice.toFixed(2)}
                          </td>
                          <td className="text-center">
                            <div className="d-flex justify-content-center gap-2">
                              <Button
                                variant="success"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  return handleAddToCart(product.id);
                                }}
                              >
                                <ShoppingBag size={14} className="me-1" />
                                Add to Cart
                              </Button>
                              <button
                                type="button"
                                className="cart-remove-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  return handleRemove(product.id);
                                }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                  </div>

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

                  <div className="text-end mt-3" />
                </div>
              </Col>
            </Row>
          )}
        </Container>
      </section>
    </div>
  );
};

export default Wishlist;
