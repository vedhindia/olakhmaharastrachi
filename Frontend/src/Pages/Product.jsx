import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Form, Pagination, Alert } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Filter, ShoppingBag, Eye, Heart, ChevronRight } from 'lucide-react';
import './Product.css';

const API_BASE = '/api';
const FALLBACK_LIST_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23f3f3f3%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%20font-size%3D%2220%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

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

const getInitialWishlist = () => {
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

const isProductInCart = async (token, productId) => {
  const response = await fetch(`${API_BASE}/cart`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to load cart');
  }
  const items = data && Array.isArray(data.items) ? data.items : [];
  const targetId = Number(productId);
  return items.some((item) => {
    const itemProductId =
      typeof item.product_id !== 'undefined'
        ? Number(item.product_id)
        : item.product && typeof item.product.id !== 'undefined'
        ? Number(item.product.id)
        : NaN;
    return !Number.isNaN(itemProductId) && itemProductId === targetId;
  });
};

const buildImageUrl = (imagePath) => {
  if (!imagePath) return FALLBACK_LIST_IMAGE;
  if (typeof imagePath !== 'string') return FALLBACK_LIST_IMAGE;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const trimmed = imagePath.replace(/^\/+/, '');
  return `${API_BASE}/${trimmed}`;
};

const mapApiProductToView = (product) => {
  const images = product.images || [];
  const primaryImage = images.find((img) => img.is_primary) || images[0];
  const imageUrl = primaryImage ? buildImageUrl(primaryImage.image_url) : FALLBACK_LIST_IMAGE;
  const categoryName =
    product.category && product.category.category_name ? product.category.category_name : 'CATEGORY';
  const retailPrice = product.customer_price ? Number(product.customer_price) : 0;
  const wholesalePrice = product.wholesaler_price ? Number(product.wholesaler_price) : 0;
  let price = retailPrice;
  if (typeof localStorage !== 'undefined') {
    const userToken = localStorage.getItem('userToken');
    const wholesalerToken = localStorage.getItem('wholesalerToken');
    if (wholesalerToken) {
      if (wholesalePrice > 0) {
        price = wholesalePrice;
      } else if (retailPrice > 0) {
        price = retailPrice;
      } else {
        price = 0;
      }
    } else if (userToken) {
      if (retailPrice > 0) {
        price = retailPrice;
      } else {
        price = 0;
      }
    } else if (retailPrice > 0) {
      price = retailPrice;
    } else if (wholesalePrice > 0) {
      price = wholesalePrice;
    } else {
      price = 0;
    }
  } else if (retailPrice > 0) {
    price = retailPrice;
  } else if (wholesalePrice > 0) {
    price = wholesalePrice;
  } else {
    price = 0;
  }
  const oldPrice = price > 0 ? price * 1.1 : 0;
  const discount =
    oldPrice > price && oldPrice > 0 ? `${Math.round(((oldPrice - price) / oldPrice) * 100)}% Off` : '';

  return {
    id: product.id,
    name: product.name,
    categoryLabel: 'CATEGORY',
    categoryName: categoryName,
    category: categoryName.toUpperCase(),
    price,
    oldPrice,
    discount,
    image: imageUrl,
  };
};

const Product = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [itemsPerPage, setItemsPerPage] = useState(16);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wishlistIds, setWishlistIds] = useState(getInitialWishlist);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const rawCategoryId =
    searchParams.get('category_id') || searchParams.get('categoryId') || searchParams.get('category') || '';
  const categoryId = rawCategoryId ? parseInt(rawCategoryId, 10) : NaN;
  const hasCategory = Number.isFinite(categoryId) && categoryId > 0;

  const readJsonSafely = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [rawCategoryId]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError('');
      try {
        const url = new URL(`${API_BASE}/products`, window.location.origin);
        url.searchParams.set('limit', String(itemsPerPage));
        url.searchParams.set('page', String(currentPage));
        if (hasCategory) {
          url.searchParams.set('category_id', String(categoryId));
        }
        const response = await fetch(url.toString());
        const data = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load products');
        }
        const list = Array.isArray(data.products) ? data.products : [];
        const mapped = list.map(mapApiProductToView);
        setProducts(mapped);
        setTotalItems(typeof data.total === 'number' ? data.total : mapped.length);
        setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
      } catch (err) {
        setError(err.message || 'Something went wrong while loading products');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentPage, itemsPerPage, hasCategory, categoryId]);

  useEffect(() => {
    const handleWishlistUpdate = () => {
      setWishlistIds(getInitialWishlist());
    };
    window.addEventListener('wishlist:update', handleWishlistUpdate);
    return () => {
      window.removeEventListener('wishlist:update', handleWishlistUpdate);
    };
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

  const handleToggleWishlist = (productId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setActionMessage('');
    setActionError('');
    const token = getAuthToken();
    if (!token) {
      const msg = 'Please login as customer or wholesaler to use wishlist';
      setActionError(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'danger' },
          }),
        );
      }
      return;
    }
    const exists = wishlistIds.includes(productId);
    if (exists) {
      const msg = 'This product is already in your wishlist';
      setActionMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'info' },
          }),
        );
      }
      return;
    }
    const updated = [...wishlistIds, productId];
    persistWishlist(updated);
    const msg = 'Added to wishlist';
    setActionMessage(msg);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:toast', {
          detail: { message: msg, variant: 'success' },
        }),
      );
    }
  };

  const handleAddToCart = async (productId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setActionMessage('');
    setActionError('');
    const token = getAuthToken();
    if (!token) {
      const msg = 'Please login as customer or wholesaler to add items to cart';
      setActionError(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'danger' },
          }),
        );
      }
      return;
    }
    try {
      const alreadyInCart = await isProductInCart(token, productId);
      if (alreadyInCart) {
        const msg = 'This product is already in your cart';
        setActionMessage(msg);
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
      setActionMessage(msg);
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
      setActionError(err.message || 'Something went wrong while adding to cart');
    }
  };

  const handleBuyNow = async (productId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setActionMessage('');
    setActionError('');
    const token = getAuthToken();
    if (!token) {
      const msg = 'Please login as customer or wholesaler to buy products';
      setActionError(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'danger' },
          }),
        );
      }
      return;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'instantPurchase',
          JSON.stringify({
            productId,
            quantity: 1,
          }),
        );
      }
      const msg = 'Redirecting to checkout.';
      setActionMessage(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:toast', {
            detail: { message: msg, variant: 'success' },
          }),
        );
      }
      navigate('/checkout?mode=instant&qty=1');
    } catch (err) {
      setActionError(err.message || 'Something went wrong while processing buy now');
    }
  };

  return (
    <div className="product-page">
      {/* Banner Section */}
      {/* <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Products</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <span>Home</span>
            <span className="dot">•</span>
            <span className="active">Products</span>
          </nav>
        </Container>
      </section> */}

      {/* Main Content Section */}
      <section className="product-content py-5">
        <Container>
          {actionError && (
            <Alert variant="danger" className="mb-3">
              {actionError}
            </Alert>
          )}
          {actionMessage && (
            <Alert variant="success" className="mb-3">
              {actionMessage}
            </Alert>
          )}
          {/* Toolbar */}
          <div className="toolbar d-flex flex-wrap justify-content-between align-items-center mb-5 pb-3 border-bottom">
            <div className="item-count mb-3 mb-md-0">
              <span className="fw-bold">
                {totalItems > 0 ? `Showing ${products.length} of ${totalItems} Item On List` : 'No items found'}
              </span>
            </div>
            
            <div className="toolbar-actions d-flex flex-wrap align-items-center gap-4">
              
              <div className="sort-select border-start ps-4">
                <Form.Select
                  className="border-0 shadow-none bg-transparent py-0 small fw-bold"
                  value={itemsPerPage}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    const nextSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
                    setItemsPerPage(nextSize);
                    setCurrentPage(1);
                  }}
                  disabled={loading}
                >
                  <option value={16}>Show 16</option>
                  <option value={32}>Show 32</option>
                  <option value={48}>Show 48</option>
                </Form.Select>
              </div>

            </div>
          </div>

          {/* Product Grid */}
          <Row className="g-4 mb-5">
            {loading && products.length === 0 && (
              <Col>
                <div className="text-center py-5">
                  <span>Loading products...</span>
                </div>
              </Col>
            )}
            {!loading && error && products.length === 0 && (
              <Col>
                <div className="text-center py-5 text-danger">
                  <span>{error}</span>
                </div>
              </Col>
            )}
            {!loading && !error && products.map((product) => (
              <Col key={product.id} lg={3} xs={6}>
                <Link
                  to={`/product/${product.id}`}
                  className="text-decoration-none text-dark"
                >
                  <div className="product-card text-center h-100">
                    <div className="product-img-wrapper position-relative mb-1">
                      {product.discount && (
                        <span
                          className="discount-badge"
                          style={{ cssText: 'background-color: rgb(22, 43, 0) !important; color: white !important; border: none !important;' }}
                        >
                          {product.discount}
                        </span>
                      )}
                      <img
                        src={product.image}
                        alt={product.name}
                        className="img-fluid product-img"
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_LIST_IMAGE;
                        }}
                      />
                      
                      <div className="product-actions d-flex justify-content-center gap-2">
                        <div
                          className="action-btn cart-btn"
                          onClick={(event) => handleAddToCart(product.id, event)}
                        >
                          <ShoppingBag size={20} />
                        </div>
                        <div
                          className="action-btn view-btn"
                        >
                          <Eye size={20} />
                        </div>
                        <div
                          className="action-btn wishlist-btn"
                          onClick={(event) => handleToggleWishlist(product.id, event)}
                        >
                          <Heart
                            size={20}
                          color={
                            wishlistIds.includes(product.id) && getAuthToken()
                              ? '#ff4d4f'
                              : '#ffffff'
                          }
                          fill={
                            wishlistIds.includes(product.id) && getAuthToken()
                              ? '#ff4d4f'
                              : 'none'
                          }
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="product-info border-top pt-4">
                      {/* Screenshot style: TWO LINES: (1) literal uppercase label CATEGORY maroon (2) actual name (3) product name */}
                      <div className="mb-2 text-center">
                        <span
                          className="text-uppercase small fw-bold"
                          style={{
                            letterSpacing: '0.05em',
                            color: 'rgb(139, 0, 0)',
                            display: 'block',
                            lineHeight: '1.2',
                          }}
                        >
                          {product.categoryLabel}
                        </span>
                        <span
                          className="d-block mt-1 fw-semibold"
                          style={{ color: 'rgb(20, 20, 20)' }}
                        >
                          {product.categoryName}
                        </span>
                      </div>
                      <h5 className="product-name fw-bold mb-3">{product.name}</h5>
                      <div className="product-price d-flex justify-content-center gap-2">
                        {product.oldPrice > 0 && (
                          <span className="old-price text-muted text-decoration-line-through">
                            ₹{product.oldPrice.toFixed(2)}
                          </span>
                        )}
                        <span className="current-price fw-bold">
                          ₹{product.price.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-3 d-flex" style={{ gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-sm flex-fill d-flex align-items-center justify-content-center border-0"
                          style={{ backgroundColor: 'rgb(86, 22, 12)', color: 'white', paddingTop: 0, paddingBottom: 0, paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: 'clamp(0.5rem, 1.5vw, 0.7rem)', height: '28px', lineHeight: '1', whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={(event) => handleAddToCart(product.id, event)}
                        >
                          ADD TO CART
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm flex-fill d-flex align-items-center justify-content-center border-0"
                          style={{ backgroundColor: 'rgb(86, 22, 12)', color: 'white', paddingTop: 0, paddingBottom: 0, paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: 'clamp(0.5rem, 1.5vw, 0.7rem)', height: '28px', lineHeight: '1', whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={(event) => handleBuyNow(product.id, event)}
                        >
                          BUY NOW
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              </Col>
            ))}
          </Row>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-wrapper d-flex justify-content-center mt-5">
              <Pagination>
                <Pagination.Prev
                  disabled={currentPage <= 1 || loading}
                  onClick={() => {
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                />
                {Array.from({ length: totalPages }).map((_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <Pagination.Item
                      key={pageNumber}
                      active={pageNumber === currentPage}
                      disabled={loading}
                      onClick={() => {
                        if (pageNumber !== currentPage) setCurrentPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </Pagination.Item>
                  );
                })}
                <Pagination.Next
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => {
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                  }}
                />
              </Pagination>
            </div>
          )}
        </Container>
      </section>
    </div>
  );
};

export default Product;
