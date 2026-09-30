import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Button, Carousel, Nav, Alert, Spinner } from 'react-bootstrap';
import { ChevronRight, ChevronLeft, Wheat, Box, Container as PackageIcon, Layers, ShoppingBag, Star, Heart, Eye, Leaf, Award, ShieldCheck, Quote } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import productImg from '../assets/images/product 5.png';
import banner1 from '../assets/images/ashoka banners 1.jpg';
import banner2 from '../assets/images/ashoka  banners 2.jpg';
import banner3 from '../assets/images/ashoka  banners 3.jpg';
import Footer from '../Components/Footer';
import './Home.css';
import bg from '../assets/images/bg.png';
import fssaiLogo from '../assets/images/fassi logo.png';
import keepCleanLogo from '../assets/images/keep clean logo.png';
import makeInIndiaLogo from '../assets/images/make in india logo.png';
import swachBharatLogo from '../assets/images/swach bharat.png';
import foodManufacturingLogo from '../assets/images/food manufacturing.png';
import attaImg from '../assets/images/atta.png';
import besanImg from '../assets/images/besan.png';
import chanaDalImg from '../assets/images/chana dal.png';
import chanaDalAltImg from '../assets/images/chanadal.png';
import maidaImg from '../assets/images/maida.png';
import moongDalImg from '../assets/images/moong dal.png';
import masoorDalImg from '../assets/images/masoor dal.png';
import kabooliChanaImg from '../assets/images/kabooli chana.png';
import matkiImg from '../assets/images/matki.png';
import chuniImg from '../assets/images/chuni.png';
import toolDalImg from '../assets/images/tool dal.png';

const API_BASE = '/api';

const FALLBACK_CARD_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f3f3f3%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%20font-size%3D%2218%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

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
  if (!imagePath) return FALLBACK_CARD_IMAGE;
  if (typeof imagePath !== 'string') return FALLBACK_CARD_IMAGE;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const trimmed = imagePath.replace(/^\/+/, '');
  return `${API_BASE}/${trimmed}`;
};

const mapApiProductToCard = (product) => {
  const images = product.images || [];
  const primaryImage = images.find((img) => img.is_primary) || images[0];
  const imageUrl = primaryImage ? buildImageUrl(primaryImage.image_url) : FALLBACK_CARD_IMAGE;
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
  const badge =
    oldPrice > price && oldPrice > 0 ? `${Math.round(((oldPrice - price) / oldPrice) * 100)}% Off` : null;

  return {
    id: product.id,
    name: product.name,
    price,
    oldPrice,
    badge,
    badgeType: badge ? 'sale' : '',
    image: imageUrl
  };
};

const Home = () => {
  const slides = [
    { id: 1, image: banner1, alt: 'Ashoka banner 1' },
    { id: 2, image: banner2, alt: 'Ashoka banner 2' },
    { id: 3, image: banner3, alt: 'Ashoka banner 3' },
  ];

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');

  const [wishlistIds, setWishlistIds] = useState(getInitialWishlist);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const readJsonSafely = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  const testimonials = [
    {
      name: 'Rajesh Sharma',
      role: 'Retail Partner',
      text: 'The quality of Ashoka Products is exceptional. Every product is fresh, hygienically packed, and delivered on time. Their commitment to quality and customer satisfaction makes them our preferred choice.',
    },
    {
      name: 'Priya Mehta',
      role: 'Distributor',
      text: "We've been sourcing products from Ashoka Products for over a year, and the consistency in quality has always impressed us. Highly recommended for anyone looking for reliable food products.",
    },
    {
      name: 'Amit Verma',
      role: 'Grocery Store Owner',
      text: 'Ashoka Products perfectly combines traditional taste with modern packaging. Our customers love the freshness and authentic flavor of every product.',
    },
    {
      name: 'Sunil Patil',
      role: 'Wholesale Buyer',
      text: 'Excellent product range, competitive pricing, and outstanding customer support. Working with Ashoka Products has been a great experience.',
    },
    {
      name: 'Neha Kulkarni',
      role: 'Happy Customer',
      text: 'The purity and quality standards maintained by Ashoka Products are truly commendable. Their products have become a trusted choice for our family.',
    },
    {
      name: 'Deepak Agarwal',
      role: 'Business Owner',
      text: 'Ashoka Products has consistently delivered premium-quality products that meet our expectations. The freshness, taste, and packaging quality are excellent.',
    },
    {
      name: 'Kavita Shah',
      role: 'Retailer',
      text: 'We appreciate the professionalism and reliability of Ashoka Products. Their dedication to quality control and timely deliveries has helped us serve our customers better.',
    },
    {
      name: 'Mahesh Jadhav',
      role: 'Distributor',
      text: 'The rich taste and superior quality of Ashoka Products stand out from other brands in the market. Our customers regularly ask for their products by name.',
    },
    {
      name: 'Anjali Desai',
      role: 'Wholesale Partner',
      text: 'From product quality to customer support, every experience with Ashoka Products has been outstanding. We look forward to a long-term business relationship.',
    },
  ];

  const [testimonialsPerSlide, setTestimonialsPerSlide] = useState(3);
  const testimonialSlides = [];
  for (let i = 0; i < testimonials.length; i += testimonialsPerSlide) {
    testimonialSlides.push(testimonials.slice(i, i + testimonialsPerSlide));
  }

  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [testiIndex, setTestiIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const updateSlides = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
      if (w <= 576) {
        setTestimonialsPerSlide(1);      // mobile: 1 card
      } else if (w < 992) {
        setTestimonialsPerSlide(2);      // tablet: 2 cards
      } else {
        setTestimonialsPerSlide(3);      // desktop: 3 cards
      }
    };
    updateSlides();
    window.addEventListener('resize', updateSlides, { passive: true });
    return () => window.removeEventListener('resize', updateSlides);
  }, []);

  useEffect(() => {
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const tick = () => {
      const now = new Date();
      let diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        target.setDate(now.getDate() + 7);
        diff = target.getTime() - now.getTime();
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);
      setTimeLeft({ days, hours, mins, secs });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError('');
      try {
        const res = await fetch(`${API_BASE}/categories?limit=8&page=1`);
        const data = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(data.message || 'Failed to load categories');
        }
        const list = Array.isArray(data.categories) ? data.categories : [];
        setCategories(list);
      } catch (err) {
        setCategoriesError(err.message || 'Something went wrong while loading categories');
      } finally {
        setCategoriesLoading(false);
      }
    };

    const loadProducts = async () => {
      setProductsLoading(true);
      setProductsError('');
      try {
        const res = await fetch(`${API_BASE}/products?limit=8&page=1`);
        const data = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(data.message || 'Failed to load products');
        }
        const list = Array.isArray(data.products) ? data.products : [];
        const mapped = list.map(mapApiProductToCard);
        setProducts(mapped);
      } catch (err) {
        setProductsError(err.message || 'Something went wrong while loading products');
      } finally {
        setProductsLoading(false);
      }
    };

    loadCategories();
    loadProducts();
  }, []);

  useEffect(() => {
    if (testimonialSlides.length <= 1) return;
    const id = setInterval(() => {
      setTestiIndex((prev) =>
        prev === testimonialSlides.length - 1 ? 0 : prev + 1
      );
    }, 3000);
    return () => clearInterval(id);
  }, [testimonialSlides.length]);

  const [itemsPerSlide, setItemsPerSlide] = useState(() => {
    if (typeof window === 'undefined') return 4;
    return window.matchMedia('(max-width: 575.98px)').matches ? 2 : 4;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 575.98px)');
    const update = () => setItemsPerSlide(mql.matches ? 2 : 4);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  
  // Continuous Categories Slider (owl-like)
  const [catIndex, setCatIndex] = useState(0);
  const computeCatSlides = (list, size) => {
    const slides = [];
    for (let i = 0; i < list.length; i += size) {
      slides.push(list.slice(i, i + size));
    }
    return slides;
  };
  const catSlides = categories && categories.length > 0 ? computeCatSlides(categories, itemsPerSlide || 4) : [];
  const handleCatPrev = () => {
    if (catSlides.length === 0) return;
    setCatIndex((prev) => (prev === 0 ? catSlides.length - 1 : prev - 1));
  };
  const handleCatNext = () => {
    if (catSlides.length === 0) return;
    setCatIndex((prev) => (prev === catSlides.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="home-page">
      {/* Hero Section with Slider */}
      <section className="hero-section p-0">
        <Carousel
          fade
          indicators
          controls
          interval={3000}
          pause="hover"
          className="hero-carousel"
        >
          {slides.map((slide) => (
            <Carousel.Item key={slide.id}>
              <img
                src={slide.image}
                alt={slide.alt}
                className="d-block w-100"
              />
            </Carousel.Item>
          ))}
        </Carousel>
      </section>
      
    

      {/* Categories Section */}
      <section className="category-section py-5">
        <Container>
          {categoriesLoading && (
            <Row className="justify-content-center g-4">
              <Col xs={12} className="text-center py-3">
                <Spinner animation="border" size="sm" className="me-2" />
                <span>Loading categories...</span>
              </Col>
            </Row>
          )}
          {!categoriesLoading && categoriesError && (
            <Row className="justify-content-center g-4">
              <Col xs={12}>
                <Alert variant="danger" className="mb-0 text-center">
                  {categoriesError}
                </Alert>
              </Col>
            </Row>
          )}
          {!categoriesLoading && !categoriesError && categories.length === 0 && (
            <Row className="justify-content-center g-4">
              <Col xs={12} className="text-center text-muted">
                No categories available.
              </Col>
            </Row>
          )}
          {!categoriesLoading && !categoriesError && categories.length > 0 && (
            <>
            <div className="d-flex justify-content-between align-items-end mb-4">
              <div>
                <span className="testi-badge">CATEGORIES</span>
                <h2 className="testi-title mt-2">Shop by Category</h2>
              </div>
            </div>
            <div className="cat-carousel position-relative">
              <div className="category-nav prev" onClick={handleCatPrev}>
                <ChevronLeft size={20} />
              </div>
              <div className="category-nav next" onClick={handleCatNext}>
                <ChevronRight size={20} />
              </div>
              <Carousel
                indicators={false}
                controls={false}
                interval={null}
                activeIndex={catIndex}
                onSelect={(idx) => setCatIndex(idx)}
                className="category-carousel"
              >
                {catSlides.map((slide, sIdx) => (
                  <Carousel.Item key={`cat-slide-${sIdx}`}>
                    <Row className="g-4">
                      {slide.map((cat) => (
                        <Col key={cat.id} lg={3} md={6} xs={6}>
                          <Link
                            to={`/shop?category=${cat.id}`}
                            className="text-decoration-none text-dark"
                          >
                            <div className="category-card">
                              <div className="category-icon-wrapper">
                                <div className="icon-circle">
                                  {(() => {
                                    const imgPath =
                                      cat.image ||
                                      cat.image_url ||
                                      cat.category_image ||
                                      cat.photo ||
                                      '';
                                    if (imgPath && typeof imgPath === 'string') {
                                      const src = imgPath.startsWith('http')
                                        ? imgPath
                                        : `${API_BASE}/uploads/${String(imgPath).replace(/^\/+/, '')}`;
                                      return (
                                        <img
                                          src={src}
                                          alt={cat.category_name || 'Category'}
                                          className="category-img"
                                          loading="lazy"
                                        />
                                      );
                                    }
                                    const n = (cat.category_name || '').toLowerCase().trim();
                                    const map = {
                                      'atta': attaImg,
                                      'besan': besanImg,
                                      'chana dal': chanaDalImg,
                                      'chanadal': chanaDalAltImg,
                                      'maida': maidaImg,
                                      'moong dal': moongDalImg,
                                      'masoor dal': masoorDalImg,
                                      'kabooli chana': kabooliChanaImg,
                                      'matki': matkiImg,
                                      'chuni': chuniImg,
                                      'tool dal': toolDalImg,
                                      'toor dal': toolDalImg,
                                      'tuvar dal': toolDalImg,
                                      'arhar dal': toolDalImg
                                    };
                                    const localImg = map[n] || map[n.replace(/\s+/g, '')] || null;
                                    if (localImg) {
                                      return (
                                        <img
                                          src={localImg}
                                          alt={cat.category_name || 'Category'}
                                          className="category-img"
                                          loading="lazy"
                                        />
                                      );
                                    }
                                    return <Layers size={40} strokeWidth={1.5} />;
                                  })()}
                                </div>
                              </div>
                              <h5 className="category-name">{cat.category_name}</h5>
                              <p className="category-count">
                                {(cat.product_count ?? 0) === 1
                                  ? '1 item'
                                  : `${cat.product_count ?? 0} items`}
                              </p>
                            </div>
                          </Link>
                        </Col>
                      ))}
                    </Row>
                  </Carousel.Item>
                ))}
              </Carousel>
            </div>
            </>
          )}
        </Container>
      </section>

      {/* Trendy Products Section */}
      <section className="trendy-products-section py-5">
        <Container>
          <div className="section-header d-flex flex-wrap justify-content-between align-items-end mb-4">
            <div className="title-area">
              <span className="subtitle">THIS MONTH</span>
              <h2 className="section-title">Trendy Products</h2>
            </div>
           
          </div>

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

          {productsLoading && (
            <Row className="g-4">
              <Col xs={12} className="text-center py-4">
                <Spinner animation="border" />
              </Col>
            </Row>
          )}
          {!productsLoading && productsError && (
            <Row className="g-4">
              <Col xs={12}>
                <Alert variant="danger" className="mb-0 text-center">
                  {productsError}
                </Alert>
              </Col>
            </Row>
          )}
          {!productsLoading && !productsError && products.length === 0 && (
            <Row className="g-4">
              <Col xs={12} className="text-center text-muted">
                No products found.
              </Col>
            </Row>
          )}
          {!productsLoading && !productsError && products.length > 0 && (
            <Row className="g-4">
              {products.map((product) => (
                <Col key={product.id} lg={3} md={4} sm={6} xs={6} className="d-flex">
                  <Link to={`/product/${product.id}`} className="text-decoration-none text-dark d-flex w-100">
                    <div className="product-card d-flex flex-column w-100">
                      <div className="product-image-wrapper">
                        <div className="product-actions">
                          <button
                            className="action-btn"
                            aria-label="Add to Wishlist"
                            onClick={(event) => handleToggleWishlist(product.id, event)}
                          >
                            <Heart
                              size={18}
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
                          </button>
                          <button
                            className="action-btn"
                            aria-label="Add to Cart"
                            onClick={(event) => handleAddToCart(product.id, event)}
                          >
                            <ShoppingBag size={18} />
                          </button>
                          <button className="action-btn" aria-label="View Details">
                            <Eye size={18} />
                          </button>
                        </div>
                        {product.badge && (
                          <span className={`product-badge ${product.badgeType}`}>
                            {product.badge}
                          </span>
                        )}
                        <img src={product.image || productImg} alt={product.name} className="product-image" />
                      </div>
                      <div className="product-info">
                        <h5 className="product-name">{product.name}</h5>
                        <div className="product-rating">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={14} fill="#ddd" color="#ddd" />
                          ))}
                        </div>
                        <p className="product-price">
                          {product.oldPrice > product.price && product.oldPrice > 0 ? (
                            <>
                              <span className="me-2 text-muted text-decoration-line-through">
                                ₹{product.oldPrice.toFixed(2)}
                              </span>
                              <span>₹{product.price.toFixed(2)}</span>
                            </>
                          ) : (
                            <>₹{product.price.toFixed(2)}</>
                          )}
                        </p>
                        <div className="mt-2">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={(event) => handleBuyNow(product.id, event)}
                          >
                            BUY NOW
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Link>
                </Col>
              ))}
            </Row>
          )}
        </Container>
      </section>
      
   
        <section className="deal-section py-5">
        <Container>
          <div className="deal-content text-center">
            <span className="deal-badge">THIS WEEK</span>
            <span className="deal-badge">THIS WEEK</span>
            <h2 className="deal-title">Weekly Best Deals</h2>
            <div className="deal-countdown d-flex justify-content-center gap-3 gap-sm-4 mt-3">
              <div className="time-box">
                <div className="value">{String(timeLeft.days).padStart(2, '0')}</div>
                <div className="label">Days</div>
              </div>
              <div className="time-box">
                <div className="value">{String(timeLeft.hours).padStart(2, '0')}</div>
                <div className="label">Hrs</div>
              </div>
              <div className="time-box">
                <div className="value">{String(timeLeft.mins).padStart(2, '0')}</div>
                <div className="label">Mins</div>
              </div>
              <div className="time-box">
                <div className="value">{String(timeLeft.secs).padStart(2, '0')}</div>
                <div className="label">Secs</div>
              </div>
            </div>
            <Link to="/product">
              <button className="deal-btn mt-4">
                BUY NOW <ChevronRight size={16} />
              </button>
            </Link>
          </div>
        </Container>
      </section>
      
      <section className="why-choose-section py-5">
        <Container>
          <div className="text-center mb-4">
            <span className="why-badge">Why Choose Ashoka</span>
            <h2 className="why-title mt-2 mb-5">Trusted Quality. Natural Goodness.</h2>
          </div>
          <Row className="g-4">
            <Col lg={3} md={6}>
              <div className="why-card">
                <div className="why-icon"><Leaf size={28} /></div>
                <h5 className="why-heading">100% Natural & Pure</h5>
                <p className="why-text">Sourced from the best farms for real, authentic taste.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="why-card">
                <div className="why-icon"><Wheat size={28} /></div>
                <h5 className="why-heading">High Protein & Nutrient‑Rich</h5>
                <p className="why-text">Packed with essential nutrients for everyday wellness.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="why-card">
                <div className="why-icon"><Award size={28} /></div>
                <h5 className="why-heading">Best Quality Ingredients</h5>
                <p className="why-text">Carefully selected grains and pulses for top quality.</p>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="why-card">
                <div className="why-icon"><ShieldCheck size={28} /></div>
                <h5 className="why-heading">Trusted Manufacturing</h5>
                <p className="why-text">Hygienic practices that meet strict safety standards.</p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>
      
      <section className="testimonial-section py-5">
        <Container>
          <div className="d-flex justify-content-between align-items-end mb-4">
            <div>
              <span className="testi-badge">Testimonials</span>
              <h2 className="testi-title mt-2">Client Feedback</h2>
            </div>
            <div className="testi-nav d-none d-md-flex gap-2">
              <button
                className="testi-nav-btn"
                aria-label="Previous"
                onClick={() =>
                  setTestiIndex((prev) =>
                    testimonialSlides.length === 0
                      ? prev
                      : prev === 0
                      ? testimonialSlides.length - 1
                      : prev - 1
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="testi-nav-btn"
                aria-label="Next"
                onClick={() =>
                  setTestiIndex((prev) =>
                    testimonialSlides.length === 0
                      ? prev
                      : prev === testimonialSlides.length - 1
                      ? 0
                      : prev + 1
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <Carousel
            indicators={false}
            controls={false}
            interval={null}
            activeIndex={testiIndex}
            onSelect={(selected) => setTestiIndex(selected)}
            className="testi-carousel"
          >
            {testimonialSlides.map((slide, index) => (
              <Carousel.Item key={`testimonial-slide-${index}`}>
                <Row className="g-4">
                  {slide.map((t, idx) => (
                    <Col key={`${t.name}-${idx}`} lg={4} md={6} xs={12}>
                      <div className="testimonial-card">
                        <div className="stars">
                          {[...Array(4)].map((_, i) => (
                            <Star key={i} size={16} fill="#ffb300" color="#ffb300" />
                          ))}
                          <Star size={16} color="#ffb300" />
                        </div>
                        <h5 className="testi-name">{t.name}</h5>
                        <div className="testi-role">{t.role}</div>
                        <p className="testi-text">{t.text}</p>
                        <div className="testi-quote">
                          <Quote size={28} />
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Carousel.Item>
            ))}
          </Carousel>
        </Container>
      </section>
      
      <section
        className="py-4"
        style={{
          backgroundImage: `url(${bg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <Container>
          <Row className=" justify-content-center align-items-center text-center py-4">
            <Col xs="auto">
              <img src={fssaiLogo} alt="FSSAI" style={{ height: 54, width: 'auto' }} />
            </Col>
            <Col xs="auto">
              <img src={keepCleanLogo} alt="Keep Clean" style={{ height: 54, width: 'auto' }} />
            </Col>
            <Col xs="auto">
              <img src={makeInIndiaLogo} alt="Make in India" style={{ height: 54, width: 'auto' }} />
            </Col>
            <Col xs="auto">
              <img src={swachBharatLogo} alt="Swachh Bharat" style={{ height: 54, width: 'auto' }} />
            </Col>
            <Col xs="auto">
              <img src={foodManufacturingLogo} alt="Food Manufacturing" style={{ height: 54, width: 'auto' }} />
            </Col>
          </Row>
        </Container>
      </section>
      
    </div>
  );
};

export default Home;
