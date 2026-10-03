import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Container, Nav, Navbar as BootstrapNavbar, NavDropdown, Button, Alert } from 'react-bootstrap';
import { Phone, ChevronDown, Heart, ShoppingBag, Menu, Salad, User, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logo from '../assets/images/logoo.png';
import './Navbar.css';

const API_BASE = '/api';

const getWishlistStorageKey = () => {
  if (typeof localStorage === 'undefined') return 'wishlistIds';
  const wholesalerToken = localStorage.getItem('wholesalerToken');
  const userToken = localStorage.getItem('userToken');
  if (wholesalerToken) return 'wishlistIds_wholesaler';
  if (userToken) return 'wishlistIds_user';
  return 'wishlistIds';
};

const getWishlistCountFromStorage = () => {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const key = getWishlistStorageKey();
    const data = localStorage.getItem(key);
    if (!data) return 0;
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed.length;
    return 0;
  } catch {
    return 0;
  }
};

const getCartCountFromStorage = () => {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem('cartCount');
  const parsed = parseInt(raw || '0', 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
};

const Navbar = () => {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [authType, setAuthType] = useState(null);
  const [wishlistCount, setWishlistCount] = useState(getWishlistCountFromStorage);
  const [cartCount, setCartCount] = useState(getCartCountFromStorage);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchWrapRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const searchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(e.target)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const buildImageUrl = (imagePath) => {
    if (!imagePath || typeof imagePath !== 'string') return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    if (imagePath.startsWith('/api/')) return imagePath;
    const trimmed = imagePath.replace(/^\/+/, '');
    if (trimmed.startsWith('uploads/')) return `${API_BASE}/${trimmed}`;
    return `${API_BASE}/uploads/${trimmed}`;
  };

  const runSearch = async (q) => {
    if (searchAbortRef.current) {
      try {
        searchAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const query = String(q || '').trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    try {
      const response = await fetch(`${API_BASE}/products?search=${encodeURIComponent(query)}&limit=6&page=1`, {
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setSearchResults([]);
      } else {
        const list = Array.isArray(data.products) ? data.products : [];
        const mapped = list.map((p) => {
          const images = Array.isArray(p.images) ? p.images : [];
          const primary = images.find((img) => img.is_primary) || images[0] || null;
          const imageUrl = primary && primary.image_url ? buildImageUrl(primary.image_url) : null;
          return { id: p.id, name: p.name || 'Product', image: imageUrl };
        });
        setSearchResults(mapped);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const onSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    searchDebounceRef.current = setTimeout(() => {
      runSearch(value);
    }, 300);
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      const first = searchResults[0];
      if (first && first.id) {
        setShowSearch(false);
        navigate(`/product/${first.id}`);
      }
    }
  };

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;

    const userToken = localStorage.getItem('userToken');
    const userInfoRaw = localStorage.getItem('userInfo');
    const wholesalerToken = localStorage.getItem('wholesalerToken');
    const wholesalerInfoRaw = localStorage.getItem('wholesalerInfo');

    if (userToken && userInfoRaw) {
      setAuthType('user');
      try {
        // const userInfo = JSON.parse(userInfoRaw);
        // const name = userInfo.name || userInfo.email || '';
        // setAuthName(name);
      } catch {
        // setAuthName('');
      }
    } else if (wholesalerToken && wholesalerInfoRaw) {
      setAuthType('wholesaler');
      try {
        // const wholesalerInfo = JSON.parse(wholesalerInfoRaw);
        // const name = wholesalerInfo.name || wholesalerInfo.email || '';
        // setAuthName(name);
      } catch {
        // setAuthName('');
      }
    } else {
      setAuthType(null);
      // setAuthName('');
    }

    setWishlistCount(getWishlistCountFromStorage());

    if (typeof localStorage !== 'undefined') {
      const token =
        localStorage.getItem('userToken') || localStorage.getItem('wholesalerToken');
      if (token) {
        fetch(`${API_BASE}/cart`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) =>
            response
              .json()
              .then((data) => ({ ok: response.ok, data }))
              .catch(() => ({ ok: false })),
          )
          .then((result) => {
            if (!result || !result.ok) return;
            const items = Array.isArray(result.data.items) ? result.data.items : [];
            const count = items.length;
            const safeCount = Number.isNaN(count) || count < 0 ? 0 : count;
            localStorage.setItem('cartCount', String(safeCount));
            setCartCount(safeCount);
          })
          .catch(() => {
            // ignore
          });
      } else {
        localStorage.removeItem('cartCount');
        setCartCount(0);
      }
    }
  }, [location]);

  useEffect(() => {
    const updateWishlistCount = () => {
      setWishlistCount(getWishlistCountFromStorage());
    };

    const updateCartCount = () => {
      setCartCount(getCartCountFromStorage());
    };

    updateWishlistCount();
    updateCartCount();

    const handleWishlistEvent = () => updateWishlistCount();
    const handleCartEvent = () => updateCartCount();
    const handleStorage = (event) => {
      if (event.key && event.key.startsWith('wishlistIds')) {
        updateWishlistCount();
      }
      if (event.key === 'cartCount') {
        updateCartCount();
      }
    };

    window.addEventListener('wishlist:update', handleWishlistEvent);
    window.addEventListener('cart:update', handleCartEvent);
    window.addEventListener('storage', handleStorage);

    if (typeof localStorage !== 'undefined') {
      const token =
        localStorage.getItem('userToken') || localStorage.getItem('wholesalerToken');
      if (token) {
        fetch(`${API_BASE}/cart`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) =>
            response
              .json()
              .then((data) => ({ ok: response.ok, data }))
              .catch(() => ({ ok: false })),
          )
          .then((result) => {
            if (!result || !result.ok) return;
            const items = Array.isArray(result.data.items) ? result.data.items : [];
            const count = items.length;
            const safeCount = Number.isNaN(count) || count < 0 ? 0 : count;
            localStorage.setItem('cartCount', String(safeCount));
            setCartCount(safeCount);
          })
          .catch(() => {
            // ignore
          });
      }
    }

    return () => {
      window.removeEventListener('wishlist:update', handleWishlistEvent);
      window.removeEventListener('cart:update', handleCartEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleToast = (event) => {
      const detail = event.detail || {};
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToast({
        message: detail.message || '',
        variant: detail.variant || 'success',
      });
      const duration =
        typeof detail.duration === 'number' && detail.duration > 0 ? detail.duration : 2500;
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, duration);
    };

    window.addEventListener('app:toast', handleToast);
    return () => {
      window.removeEventListener('app:toast', handleToast);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const handleLogout = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userInfo');
      localStorage.removeItem('userAddress');
      localStorage.removeItem('wholesalerToken');
      localStorage.removeItem('wholesalerInfo');
      localStorage.removeItem('wishlistIds');
      localStorage.removeItem('wishlistIds_user');
      localStorage.removeItem('wishlistIds_wholesaler');
      localStorage.removeItem('cartCount');
      window.dispatchEvent(new Event('wishlist:update'));
      window.dispatchEvent(new Event('cart:update'));
    }
    setAuthType(null);
    // setAuthName('');
    setWishlistCount(0);
    setCartCount(0);
    navigate('/');
  };

  return (
    <div className={`navbar-wrapper${scrolled ? ' scrolled' : ''}`}>
      {/* Top Bar */}
      <div className="top-bar bg-dark text-white py-2">
        <Container className="d-flex justify-content-between align-items-center">
          <div className="top-bar-left d-flex align-items-center gap-2 small">
            <Phone size={14} />
            <span>+91 70572 86411</span>
          </div>
          <div className="top-bar-center  small d-none d-md-block">
            EMAIL:{' '}
            <span className="fw-bold">omksarsatpute2006@gmail.com</span>
          </div>
          <div className="top-bar-right d-flex gap-3 small">
            <label className="language-selector d-flex align-items-center gap-2">
              <span>{t('Language')}</span>
              <select
                aria-label={t('Select language')}
                className="form-select form-select-sm"
                value={i18n.resolvedLanguage || 'en'}
                onChange={(event) => {
                  const language = event.target.value;
                  window.localStorage.setItem('siteLanguage', language);
                  i18n.changeLanguage(language);
                }}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
              </select>
            </label>
          </div>
        </Container>
      </div>

      {/* Main Navbar */}
      <BootstrapNavbar bg="white" expand="lg" className="main-nav py-2 border-bottom" expanded={expanded} onToggle={setExpanded}>
        <Container>
          <BootstrapNavbar.Brand as={Link} to="/" className="d-flex align-items-center">
            <img 
              src={logo} 
              alt="Ashoka Logo" 
              className="navbar-logo-img"
            />
          </BootstrapNavbar.Brand>

          <BootstrapNavbar.Toggle aria-controls="basic-navbar-nav" />
          
          <BootstrapNavbar.Collapse id="basic-navbar-nav">
            <button
              type="button"
              aria-label="Close menu"
              className="navbar-close d-lg-none"
              onClick={() => {
                const toggler = document.querySelector('.navbar-toggler');
                if (toggler) {
                  toggler.click();
                }
              }}
            >
              &times;
            </button>
            <Nav className="mx-auto gap-lg-4">
              <Nav.Link 
                as={Link} 
                to="/" 
                active={location.pathname === '/'}
                className="fw-semibold text-dark nav-link-custom"
                onClick={() => setExpanded(false)}
              >
                Home
              </Nav.Link>
              <Nav.Link 
                as={Link} 
                to="/about" 
                active={location.pathname === '/about'}
                className="fw-semibold text-dark nav-link-custom"
                onClick={() => setExpanded(false)}
              >
                About
              </Nav.Link>
              <Nav.Link 
                as={Link} 
                to="/shop" 
                active={location.pathname === '/shop' || location.pathname === '/product'}
                className="fw-semibold text-dark nav-link-custom"
                onClick={() => setExpanded(false)}
              >
                Products
              </Nav.Link>
              <Nav.Link as={Link} to="/contact" className="fw-semibold text-dark nav-link-custom" onClick={() => setExpanded(false)}>Contact</Nav.Link>
            </Nav>

            <div className="d-flex align-items-center gap-3 mt-3 mt-lg-0">
              <div className="nav-search position-relative" ref={searchWrapRef}>
                <button
                  type="button"
                  aria-label="Search"
                  className="btn p-0 border-0 bg-transparent text-dark"
                  onClick={() => setShowSearch((v) => !v)}
                >
                  <Search size={24} />
                </button>
                {showSearch && (
                  <div className="nav-search-popover">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search products..."
                      autoFocus
                      value={searchQuery}
                      onChange={onSearchChange}
                      onKeyDown={onSearchKeyDown}
                    />
                    <div className="mt-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {searchLoading && (
                        <div className="small text-muted px-1 py-1">Searching…</div>
                      )}
                      {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                        <div className="small text-muted px-1 py-1">No products found</div>
                      )}
                      {!searchLoading &&
                        searchResults.map((item) => (
                          <Link
                            key={item.id}
                            to={`/product/${item.id}`}
                            className="d-flex align-items-center gap-2 text-decoration-none text-dark py-1 px-1 rounded-2"
                            onClick={() => {
                              setShowSearch(false);
                              setExpanded(false);
                            }}
                            style={{ transition: 'background-color .2s' }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 6,
                                border: '1px solid #eee',
                                background: '#fafafa',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span className="small text-muted">No Img</span>
                              )}
                            </div>
                            <div className="flex-grow-1">
                              <div className="small fw-semibold">{item.name}</div>
                            </div>
                          </Link>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <Link
                to="/wishlist"
                className="position-relative cursor-pointer text-decoration-none text-dark"
                onClick={() => setExpanded(false)}
              >
                <Heart size={24} />
                {authType && wishlistCount > 0 && (
                  <span className="badge-custom">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </Link>
              <Link
                to="/cart"
                className="position-relative cursor-pointer text-decoration-none text-dark"
                onClick={() => setExpanded(false)}
              >
                <ShoppingBag size={24} />
                {cartCount > 0 && (
                  <span className="badge-custom">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
              {authType ? (
                <NavDropdown
                  align="end"
                  id="profile-dropdown"
                  title={<User size={24} />}
                >
                  <NavDropdown.Item
                    onClick={() => {
                      navigate('/my-profile');
                      setExpanded(false);
                    }}
                  >
                    My Profile
                  </NavDropdown.Item>
                  <NavDropdown.Item
                    onClick={() => {
                      navigate('/orders');
                      setExpanded(false);
                    }}
                  >
                    Orders
                  </NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/wishlist" onClick={() => setExpanded(false)}>
                    My Wishlist
                  </NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/cart" onClick={() => setExpanded(false)}>
                    My Cart
                  </NavDropdown.Item>
                  <NavDropdown.Divider />
                  <NavDropdown.Item onClick={() => {
                    handleLogout();
                    setExpanded(false);
                  }}>
                    Logout
                  </NavDropdown.Item>
                </NavDropdown>
              ) : (
              <Button
                  as={Link}
                  to="/auth"
                  variant="success"
                  size="sm"
                  className="fw-semibold px-3"
                  onClick={() => setExpanded(false)}
                >
                  Login / Register
                </Button>
              )}
            </div>
          </BootstrapNavbar.Collapse>
        </Container>
      </BootstrapNavbar>
      {toast && toast.message && (
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 2000 }}>
          <Alert
            variant={toast.variant}
            className="shadow-sm mb-0 d-flex align-items-center justify-content-between"
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="btn-close ms-2"
              aria-label="Close"
              onClick={() => setToast(null)}
            />
          </Alert>
        </div>
      )}
    </div>
  );
};

export default Navbar;
