import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Button, Alert } from 'react-bootstrap';
import { ShoppingBag, Eye, Heart, Star } from 'lucide-react';
import './Product.css';

const API_BASE = '/api';
const FALLBACK_DETAIL_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22500%22%20height%3D%22500%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f3f3f3%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%20font-size%3D%2224%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

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
  if (!imagePath) return FALLBACK_DETAIL_IMAGE;
  if (typeof imagePath !== 'string') return FALLBACK_DETAIL_IMAGE;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const trimmed = imagePath.replace(/^\/+/, '');
  return `${API_BASE}/${trimmed}`;
};

const mapApiProductToView = (product) => {
  const images = product.images || [];
  const orderedImages = [...images].sort((a, b) => {
    const aOrder = typeof a.sort_order === 'number' ? a.sort_order : 0;
    const bOrder = typeof b.sort_order === 'number' ? b.sort_order : 0;
    return aOrder - bOrder;
  });
  const primaryImage = orderedImages.find((img) => img.is_primary) || orderedImages[0];
  const primaryImageUrl = primaryImage ? buildImageUrl(primaryImage.image_url) : FALLBACK_DETAIL_IMAGE;
  const allImageUrls = orderedImages.map((img) => buildImageUrl(img.image_url));
  const categoryName =
    (product.category && product.category.category_name) ||
    product.category_name ||
    'CATEGORY';
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
    sku: product.sku || '',
    category: categoryName.toUpperCase(),
    price,
    oldPrice,
    discount,
    image: primaryImageUrl,
    images: allImageUrls,
    description: product.description || '',
  };
};

const ProductDetails = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState('');
  const [wishlistIds, setWishlistIds] = useState(getInitialWishlist);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [canSubmitReview, setCanSubmitReview] = useState(false);
  const [checkingReviewEligibility, setCheckingReviewEligibility] = useState(false);
  const navigate = useNavigate();

  const readJsonSafely = useCallback(async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }, []);

  const fetchRelatedProducts = useCallback(async (baseProduct) => {
    setRelatedLoading(true);
    setRelatedError('');
    try {
      const baseProductId = Number(baseProduct?.id);
      const categoryId =
        Number(baseProduct?.category_id) ||
        Number(baseProduct?.category?.id) ||
        null;

      if (!categoryId) {
        setRelatedProducts([]);
        return;
      }

      const response = await fetch(
        `${API_BASE}/products?category_id=${encodeURIComponent(categoryId)}&limit=20&page=1`,
      );
      const data = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load related products');
      }
      const list = Array.isArray(data.products) ? data.products : [];
      const filtered = list.filter((p) => {
        if (!p) return false;
        if (Number(p.id) === baseProductId) return false;
        const sameCategory =
          Number(p.category_id) === categoryId ||
          Number(p?.category?.id) === categoryId;
        if (!sameCategory) return false;
        const status = String(p.status ?? '').toLowerCase();
        const isActive =
          status === '' || status === 'active' || status === '1' || p.status === 1 || p.status === true;
        return isActive;
      });
      const mapped = filtered.map(mapApiProductToView);
      setRelatedProducts(mapped);
    } catch (err) {
      setRelatedError(err.message || 'Something went wrong while loading related products');
    } finally {
      setRelatedLoading(false);
    }
  }, [readJsonSafely]);

  useEffect(() => {
    const handleWishlistUpdate = () => {
      setWishlistIds(getInitialWishlist());
    };
    window.addEventListener('wishlist:update', handleWishlistUpdate);
    return () => {
      window.removeEventListener('wishlist:update', handleWishlistUpdate);
    };
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/products/${id}`);
        const data = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load product');
        }
        const viewProduct = mapApiProductToView(data);
        setProduct(viewProduct);
        setActiveImageIndex(0);
        setQuantity(1);
        if (data && data.id) {
          fetchRelatedProducts(data);
        } else {
          setRelatedProducts([]);
        }
        const productIdToUse = data && data.id ? data.id : id;
        if (productIdToUse) {
          fetchReviews(productIdToUse, 1);
          checkReviewEligibility(productIdToUse);
        }
      } catch (err) {
        setError(err.message || 'Something went wrong while loading product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, fetchRelatedProducts, readJsonSafely]);

  const fetchReviews = async (productId, page = 1) => {
    setReviewsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/reviews/product/${productId}?page=${page}&limit=5`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load reviews');
      }
      const list = Array.isArray(data.reviews) ? data.reviews : [];
      setReviews(list);
      setReviewsPage(data.currentPage || page);
      setReviewsTotalPages(data.totalPages || 1);
      if (typeof data.totalReviews === 'number') {
        setTotalReviews(data.totalReviews);
      } else {
        setTotalReviews(list.length);
      }
      if (typeof data.averageRating === 'number') {
        setAverageRating(data.averageRating);
      } else if (data.averageRating !== null && data.averageRating !== undefined) {
        const parsed = Number(data.averageRating);
        setAverageRating(Number.isNaN(parsed) ? null : parsed);
      } else {
        setAverageRating(null);
      }
    } catch (err) {
      setActionError(err.message || 'Something went wrong while loading reviews');
    } finally {
      setReviewsLoading(false);
    }
  };

  const checkReviewEligibility = async (productId) => {
    const token = getAuthToken();
    if (!token || !productId) {
      setCanSubmitReview(false);
      return;
    }
    setCheckingReviewEligibility(true);
    try {
      const response = await fetch(`${API_BASE}/orders`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        setCanSubmitReview(false);
        return;
      }
      const orders = await response.json();
      if (!Array.isArray(orders)) {
        setCanSubmitReview(false);
        return;
      }
      const hasCompletedOrder = orders.some((order) => {
        if (!order || order.status !== 'delivered' || !Array.isArray(order.items)) {
          return false;
        }
        return order.items.some((item) => item.product_id === Number(productId));
      });
      setCanSubmitReview(hasCompletedOrder);
    } catch {
      setCanSubmitReview(false);
    } finally {
      setCheckingReviewEligibility(false);
    }
  };

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

  const handleToggleWishlist = (productId) => {
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

  const handleAddToCart = async (productId, qty = 1) => {
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
        body: JSON.stringify({ product_id: productId, quantity: qty }),
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

  const handleBuyNow = async (productId, qty = 1) => {
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
      const quantityToUse = Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 1;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'instantPurchase',
          JSON.stringify({
            productId,
            quantity: quantityToUse,
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
      navigate(`/checkout?mode=instant&qty=${quantityToUse}`);
    } catch (err) {
      setActionError(err.message || 'Something went wrong while processing buy now');
    }
  };

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Product Details</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <a href="/" className='text-decoration-none text-white'>Home</a>
            <span className="dot">•</span>
            <a href="/product" className='text-decoration-none text-white'>Product</a>
            <span className="dot">•</span>
            <span>Details</span>
          </nav>
        </Container>
      </section>

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
          {loading && (
            <div className="text-center py-5">
              <span>Loading product...</span>
            </div>
          )}
          {!loading && error && (
            <div className="text-center py-5 text-danger">
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && product && (
            <>
              <Row className="g-4 align-items-start">
                <Col md={5}>
                  <div className="product-detail-gallery d-flex">
                    <div className="product-detail-thumbs me-3">
                      {(product.images && product.images.length > 0
                        ? product.images
                        : [product.image]
                      ).map((url, index) => (
                        <button
                          type="button"
                          key={index}
                          className={`product-detail-thumb-btn${
                            index === activeImageIndex ? ' active' : ''
                          }`}
                          onClick={() => setActiveImageIndex(index)}
                        >
                          <img
                            src={url || FALLBACK_DETAIL_IMAGE}
                            alt={`${product.name} ${index + 1}`}
                            onError={(e) => {
                              e.currentTarget.src = FALLBACK_DETAIL_IMAGE;
                            }}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="product-detail-main-img-wrapper position-relative flex-grow-1">
                      {product.discount && (
                        <span className="discount-badge">
                          {product.discount}
                        </span>
                      )}
                      <div className="product-detail-main-img">
                        <img
                          src={
                            (product.images && product.images.length > 0
                              ? product.images[activeImageIndex]
                              : product.image) || FALLBACK_DETAIL_IMAGE
                          }
                          alt={product.name}
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_DETAIL_IMAGE;
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Col>
                <Col md={7}>
                    <div className="product-info">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="badge-detail-status">
                        Featured
                      </span>
                      <div className="product-detail-rating d-flex align-items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star
                            key={value}
                            size={16}
                            fill={
                              averageRating && value <= Math.round(averageRating)
                                ? '#ffc107'
                                : 'none'
                            }
                            stroke="#ffc107"
                          />
                        ))}
                        <span className="small text-muted ms-1">
                          {averageRating
                            ? `${averageRating.toFixed(1)} / 5`
                            : 'No rating yet'}
                        </span>
                        <span className="small text-muted ms-1">
                          {`(${totalReviews} ${totalReviews === 1 ? 'Review' : 'Reviews'})`}
                        </span>
                      </div>
                    </div>
                    <p className="product-category text-uppercase small fw-bold mb-2">
                      {product.category}
                    </p>
                    <h2 className="product-name fw-bold mb-3">{product.name}</h2>
                    <div className="product-price d-flex align-items-center gap-2 mb-3">
                      {product.oldPrice > 0 && (
                        <span className="old-price text-muted text-decoration-line-through">
                          ₹{product.oldPrice.toFixed(2)}
                        </span>
                      )}
                      <span className="current-price fw-bold fs-4">
                        ₹{product.price.toFixed(2)}
                      </span>
                    </div>
                    {product.description && (
                      <p className="mb-4">
                        {product.description}
                      </p>
                    )}
                    <div className="d-flex align-items-center gap-3 mb-4">
                      <span className="small fw-semibold text-muted">
                        Quantity
                      </span>
                      <div className="qty-control">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() =>
                            setQuantity((prev) => (prev > 1 ? prev - 1 : 1))
                          }
                        >
                          −
                        </button>
                        <span className="qty-value">{quantity}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() =>
                            setQuantity((prev) => prev + 1)
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-3">
                      <Button
                        variant="success"
                        onClick={() => handleAddToCart(product.id, quantity)}
                      >
                        <ShoppingBag size={18} className="me-2" />
                        Add To Cart
                      </Button>
                      <Button
                        variant="outline-success"
                        onClick={() => handleBuyNow(product.id, quantity)}
                      >
                        Buy Now
                      </Button>
                      <Button
                        variant="outline-secondary"
                        onClick={() => handleToggleWishlist(product.id)}
                      >
                        <Heart
                          size={18}
                          className="me-2"
                          color={
                            wishlistIds.includes(product.id) && getAuthToken()
                              ? '#ff4d4f'
                              : undefined
                          }
                          fill={
                            wishlistIds.includes(product.id) && getAuthToken()
                              ? '#ff4d4f'
                              : 'none'
                          }
                        />
                        Add to Wishlist
                      </Button>
                    </div>
                    <div className="product-detail-meta mt-4 small text-muted">
                      <div>
                        <span className="meta-label">SKU:</span>
                        <span className="meta-value">{product.sku || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="meta-label">Categories:</span>
                        <span className="meta-value">{product.category}</span>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>

              <Row className="mt-5">
                <Col lg={12}>
                  <div className="product-detail-tabs">
                    <div className="product-detail-tab-headers d-flex flex-wrap">
                      <button
                        type="button"
                        className={`product-detail-tab-btn${
                          activeTab === 'description' ? ' active' : ''
                        }`}
                        onClick={() => setActiveTab('description')}
                      >
                        Description
                      </button>
                      <button
                        type="button"
                        className={`product-detail-tab-btn${
                          activeTab === 'additional' ? ' active' : ''
                        }`}
                        onClick={() => setActiveTab('additional')}
                      >
                        Additional Information
                      </button>
                      <button
                        type="button"
                        className={`product-detail-tab-btn${
                          activeTab === 'reviews' ? ' active' : ''
                        }`}
                        onClick={() => setActiveTab('reviews')}
                      >
                        Reviews
                      </button>
                    </div>
                    <div className="product-detail-tab-body">
                      {activeTab === 'description' && (
                        <div className="product-detail-tab-pane">
                          <p>
                            {product.description ||
                              'No description available for this product.'}
                          </p>
                        </div>
                      )}
                      {activeTab === 'additional' && (
                        <div className="product-detail-tab-pane">
                          <ul className="list-unstyled mb-0">
                            <li>
                              <span className="meta-label">Category:</span>
                              <span className="meta-value">{product.category}</span>
                            </li>
                            <li>
                              <span className="meta-label">Price:</span>
                              <span className="meta-value">
                                ₹{product.price.toFixed(2)}
                              </span>
                            </li>
                          </ul>
                        </div>
                      )}
                      {activeTab === 'reviews' && (
                        <div className="product-detail-tab-pane">
                          <h5 className="mb-4">
                            {totalReviews} review{totalReviews === 1 ? '' : 's'} for "{product.name}"
                          </h5>
                          <div className="product-review-list mb-4">
                            {reviewsLoading && (
                              <div className="text-muted small mb-2">Loading reviews...</div>
                            )}
                            {!reviewsLoading && reviews.length === 0 && (
                              <div className="text-muted small mb-2">
                                No reviews yet. Be the first to review this product.
                              </div>
                            )}
                            {!reviewsLoading &&
                              reviews.map((review) => {
                                const customerName =
                                  review.customer && review.customer.name
                                    ? review.customer.name
                                    : review.customer && review.customer.phone
                                    ? review.customer.phone
                                    : review.customer && review.customer.email
                                    ? review.customer.email
                                    : '';
                                const wholesalerName =
                                  review.wholesaler && review.wholesaler.name
                                    ? review.wholesaler.name
                                    : review.wholesaler && review.wholesaler.business_name
                                    ? review.wholesaler.business_name
                                    : review.wholesaler && review.wholesaler.phone
                                    ? review.wholesaler.phone
                                    : review.wholesaler && review.wholesaler.email
                                    ? review.wholesaler.email
                                    : '';
                                const displayName =
                                  customerName || wholesalerName || 'Anonymous';
                                const avatarLetter =
                                  displayName && displayName.length > 0
                                    ? displayName.charAt(0).toUpperCase()
                                    : product.name.charAt(0).toUpperCase();
                                const createdAt =
                                  review.created_at || review.createdAt || review.updated_at || review.updatedAt;
                                const dateLabel = createdAt
                                  ? new Date(createdAt).toLocaleDateString()
                                  : '';
                                return (
                                  <div
                                    key={review.id}
                                    className="product-review-item d-flex gap-3 mb-3"
                                  >
                                    <div className="product-review-avatar">
                                      {avatarLetter}
                                    </div>
                                    <div className="product-review-content">
                                      <div className="d-flex justify-content-between mb-1">
                                        <strong>{displayName}</strong>
                                        <div className="product-detail-rating d-flex align-items-center gap-1">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                              key={star}
                                              size={14}
                                              fill={star <= review.rating ? '#ffc107' : 'none'}
                                              stroke="#ffc107"
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      {dateLabel && (
                                        <div className="small text-muted mb-1">
                                          {dateLabel}
                                        </div>
                                      )}
                                      <p className="mb-0">
                                        {review.comment || 'No comment provided.'}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          {reviewsTotalPages > 1 && (
                            <div className="d-flex gap-2 mb-4">
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                disabled={reviewsPage <= 1 || reviewsLoading}
                                onClick={() => fetchReviews(product.id, reviewsPage - 1)}
                              >
                                Previous
                              </Button>
                              <div className="small d-flex align-items-center">
                                Page {reviewsPage} of {reviewsTotalPages}
                              </div>
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                disabled={reviewsPage >= reviewsTotalPages || reviewsLoading}
                                onClick={() => fetchReviews(product.id, reviewsPage + 1)}
                              >
                                Next
                              </Button>
                            </div>
                          )}
                          <div className="product-review-form">
                            <h5 className="mb-3">Add a review</h5>
                            {!canSubmitReview && !checkingReviewEligibility && (
                              <div className="alert alert-info py-2 mb-3 small">
                                You can submit a review after an order containing this product is delivered.
                              </div>
                            )}
                            <form
                              onSubmit={async (event) => {
                                event.preventDefault();
                                setActionMessage('');
                                setActionError('');
                                const token = getAuthToken();
                                if (!token) {
                                  const msg =
                                    'Please login as customer or wholesaler to submit a review';
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
                                if (!canSubmitReview) {
                                  const msg =
                                    'You can submit a review after an order containing this product is delivered.';
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
                                  const response = await fetch(`${API_BASE}/reviews`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      product_id: product.id,
                                      rating: newReviewRating,
                                      comment: newReviewComment.trim() || null,
                                    }),
                                  });
                                  const data = await response.json();
                                  if (!response.ok) {
                                    const msg =
                                      data && data.message
                                        ? data.message
                                        : 'Failed to submit review';
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
                                  const msg =
                                    'Review submitted successfully and is pending approval';
                                  setActionMessage(msg);
                                  setNewReviewComment('');
                                  setNewReviewRating(5);
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                      new CustomEvent('app:toast', {
                                        detail: { message: msg, variant: 'success' },
                                      }),
                                    );
                                  }
                                  fetchReviews(product.id, 1);
                                } catch (err) {
                                  const msg =
                                    err && err.message
                                      ? err.message
                                      : 'Something went wrong while submitting review';
                                  setActionError(msg);
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                      new CustomEvent('app:toast', {
                                        detail: { message: msg, variant: 'danger' },
                                      }),
                                    );
                                  }
                                }
                              }}
                            >
                              <div className="mb-3">
                                <label className="form-label small">
                                  Your rating
                                </label>
                                <div className="d-flex align-items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      className="btn btn-link p-0 me-1"
                                      onClick={() => setNewReviewRating(star)}
                                    >
                                      <Star
                                        size={18}
                                        fill={star <= newReviewRating ? '#ffc107' : 'none'}
                                        stroke="#ffc107"
                                      />
                                    </button>
                                  ))}
                                  <span className="small text-muted ms-2">
                                    {newReviewRating} / 5
                                  </span>
                                </div>
                              </div>
                              <div className="mb-3">
                                <label className="form-label small">
                                  Your review
                                </label>
                                <textarea
                                  className="form-control"
                                  rows={4}
                                  required
                                  value={newReviewComment}
                                  onChange={(e) => setNewReviewComment(e.target.value)}
                                />
                              </div>
                              <Button type="submit" variant="success">
                                Submit Now
                              </Button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Col>
              </Row>
            </>
          )}

          {!loading && !error && (relatedLoading || relatedError || relatedProducts.length > 0) && (
            <div className="mt-5">
              <h3 className="mb-4 text-center">Related Products</h3>
              {relatedLoading && (
                <div className="text-center py-3">
                  <span>Loading related products...</span>
                </div>
              )}
              {!relatedLoading && relatedError && (
                <div className="text-center py-3 text-danger">
                  <span>{relatedError}</span>
                </div>
              )}
              {!relatedLoading && !relatedError && relatedProducts.length > 0 && (
                <Row className="g-4">
                  {relatedProducts.map((item) => {
                    const isInWishlist = wishlistIds.includes(item.id) && getAuthToken();
                    return (
                      <Col key={item.id} lg={3} md={6}>
                        <div className="product-card text-center h-100">
                          <div className="product-img-wrapper position-relative mb-1">
                            {item.discount && (
                              <span className="discount-badge">{item.discount}</span>
                            )}
                            <Link
                              to={`/product/${item.id}`}
                              className="d-block"
                            >
                              <img
                                src={item.image}
                                alt={item.name}
                                className="img-fluid product-img"
                                onError={(e) => {
                                  e.currentTarget.src = FALLBACK_DETAIL_IMAGE;
                                }}
                              />
                            </Link>
                            <div className="product-actions d-flex justify-content-center gap-2">
                              <button
                                type="button"
                                className="action-btn cart-btn"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleAddToCart(item.id, 1);
                                }}
                              >
                                <ShoppingBag size={20} />
                              </button>
                              <Link
                                to={`/product/${item.id}`}
                                className="action-btn view-btn d-inline-flex align-items-center justify-content-center"
                              >
                                <Eye size={20} />
                              </Link>
                              <button
                                type="button"
                                className="action-btn wishlist-btn"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleToggleWishlist(item.id);
                                }}
                              >
                                <Heart
                                  size={20}
                                  color={isInWishlist ? '#ff4d4f' : undefined}
                                  fill={isInWishlist ? '#ff4d4f' : 'none'}
                                />
                              </button>
                            </div>
                          </div>
                          <div className="product-info border-top pt-4">
                            <p className="product-category text-uppercase small fw-bold mb-2">
                              {item.category}
                            </p>
                            <h5 className="product-name fw-bold mb-3">
                              <Link
                                to={`/product/${item.id}`}
                                className="text-decoration-none text-dark"
                              >
                                {item.name}
                              </Link>
                            </h5>
                            <div className="product-price d-flex justify-content-center gap-2">
                              {item.oldPrice > 0 && (
                                <span className="old-price text-muted text-decoration-line-through">
                                  ₹{item.oldPrice.toFixed(2)}
                                </span>
                              )}
                              <span className="current-price fw-bold">
                                ₹{item.price.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </div>
          )}
        </Container>
      </section>
    </div>
  );
};

export default ProductDetails;
