import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Layers, LogOut, KeyRound, Settings, User, Users, Briefcase, ChevronDown, ChevronRight, MessageSquare, ShoppingCart, Tag, Mail, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Nav, Collapse } from 'react-bootstrap';
import logo from '../assets/logo.png';
import api from '../services/api';

const INQUIRIES_LAST_SEEN_KEY = 'admin:lastSeen:inquiries';
const ORDERS_LAST_SEEN_KEY = 'admin:lastSeen:orders';
const REVIEWS_LAST_SEEN_KEY = 'admin:lastSeen:reviews';
const USERS_LAST_SEEN_KEY = 'admin:lastSeen:users';
const WHOLESALERS_LAST_SEEN_KEY = 'admin:lastSeen:wholesalers';

const Sidebar = ({ className = '', style = {}, onNavigate }) => {
  const { logout } = useAuth();
  const location = useLocation();
  
  // Check if current path is a setting path to auto-open
  const isSettingsActive = location.pathname === '/profile' || location.pathname === '/change-password';
  const [openSettings, setOpenSettings] = useState(isSettingsActive);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [wholesalerCount, setWholesalerCount] = useState(0);

  const isActive = (path) => location.pathname === path;

  const toggleSettings = () => setOpenSettings(!openSettings);

  useEffect(() => {
    const now = Date.now();
    const markSeen = (key, setCount, eventName) => {
      try {
        localStorage.setItem(key, String(now));
      } catch {}
      if (typeof setCount === 'function') setCount(0);
      if (typeof window !== 'undefined' && eventName) {
        window.dispatchEvent(new Event(eventName));
      }
    };

    if (location.pathname === '/inquiries') {
      markSeen(INQUIRIES_LAST_SEEN_KEY, setInquiryCount, 'admin:inquiries-seen');
    } else if (location.pathname === '/orders') {
      markSeen(ORDERS_LAST_SEEN_KEY, setOrderCount, 'admin:orders-seen');
    } else if (location.pathname === '/reviews') {
      markSeen(REVIEWS_LAST_SEEN_KEY, setReviewCount, 'admin:reviews-seen');
    } else if (location.pathname === '/users') {
      markSeen(USERS_LAST_SEEN_KEY, setUserCount, 'admin:users-seen');
    } else if (location.pathname === '/wholesalers') {
      markSeen(WHOLESALERS_LAST_SEEN_KEY, setWholesalerCount, 'admin:wholesalers-seen');
    }
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const getFromIso = (key) => {
      let raw = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }
      if (!raw) return undefined;

      let lastSeen = Number(raw);
      if (!Number.isFinite(lastSeen)) {
        const parsed = Date.parse(raw);
        lastSeen = Number.isFinite(parsed) ? parsed : 0;
      }

      if (!Number.isFinite(lastSeen) || lastSeen <= 0) return undefined;
      return new Date(lastSeen).toISOString();
    };

    const fetchAllCounts = async () => {
      try {
        const [inqRes, ordRes, revRes, usrRes, whRes] = await Promise.all([
          api.get('/communications/admin', {
            params: {
              source: 'contact_form',
              channel: 'email',
              from: getFromIso(INQUIRIES_LAST_SEEN_KEY),
              page: 1,
              limit: 1,
            },
          }),
          api.get('/orders/admin/all', {
            params: {
              from: getFromIso(ORDERS_LAST_SEEN_KEY),
              page: 1,
              limit: 1,
            },
          }),
          api.get('/reviews/admin', {
            params: {
              status: 'pending',
              from: getFromIso(REVIEWS_LAST_SEEN_KEY),
              page: 1,
              limit: 1,
            },
          }),
          api.get('/users', {
            params: {
              from: getFromIso(USERS_LAST_SEEN_KEY),
              page: 1,
              limit: 1,
            },
          }),
          api.get('/wholesalers', {
            params: {
              from: getFromIso(WHOLESALERS_LAST_SEEN_KEY),
              page: 1,
              limit: 1,
            },
          }),
        ]);

        if (cancelled) return;
        setInquiryCount(Number(inqRes?.data?.total || 0));
        setOrderCount(Number(ordRes?.data?.totalOrders || 0));
        setReviewCount(Number(revRes?.data?.totalReviews || 0));
        setUserCount(Number(usrRes?.data?.total || 0));
        setWholesalerCount(Number(whRes?.data?.total || 0));
      } catch {
        if (!cancelled) {
          setInquiryCount(0);
          setOrderCount(0);
          setReviewCount(0);
          setUserCount(0);
          setWholesalerCount(0);
        }
      }
    };

    fetchAllCounts();
    const intervalId = window.setInterval(fetchAllCounts, 30_000);
    const onSeen = () => fetchAllCounts();
    window.addEventListener('admin:inquiries-seen', onSeen);
    window.addEventListener('admin:orders-seen', onSeen);
    window.addEventListener('admin:reviews-seen', onSeen);
    window.addEventListener('admin:users-seen', onSeen);
    window.addEventListener('admin:wholesalers-seen', onSeen);
    window.addEventListener('focus', fetchAllCounts);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('admin:inquiries-seen', onSeen);
      window.removeEventListener('admin:orders-seen', onSeen);
      window.removeEventListener('admin:reviews-seen', onSeen);
      window.removeEventListener('admin:users-seen', onSeen);
      window.removeEventListener('admin:wholesalers-seen', onSeen);
      window.removeEventListener('focus', fetchAllCounts);
    };
  }, []);

  const renderBadge = (count) => {
    if (!count || count <= 0) return null;
    return (
      <span className="badge rounded-pill bg-danger" style={{ minWidth: 28, textAlign: 'center' }}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  return (
    <div 
      className={`d-flex flex-column flex-shrink-0 p-4 text-white sidebar-wrapper ${className}`} 
      style={{ minHeight: '100%', ...style }}
    >
      <Link to="/" className="d-flex align-items-center justify-content-center mb-5 text-white text-decoration-none w-100">
        <div className="bg-white p-2 rounded-circle shadow-lg d-flex align-items-center justify-content-center" style={{ width: '110px', height: '110px' }}>
          <img 
            src={logo} 
            alt="Ecommerce Ashoka" 
            style={{ width: '90px', height: '90px', objectFit: 'contain' }}
          />
        </div>
      </Link>
      
      <Nav variant="pills" className="flex-column mb-auto gap-2">
        <Nav.Item>
          <Link
            to="/dashboard"
            className={`nav-link-custom ${isActive('/dashboard') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <LayoutDashboard className="me-3" size={20} />
            <span>Dashboard</span>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/categories"
            className={`nav-link-custom ${isActive('/categories') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <Layers className="me-3" size={20} />
            <span>Categories</span>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/products"
            className={`nav-link-custom ${isActive('/products') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <ShoppingBag className="me-3" size={20} />
            <span>Products</span>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/orders"
            className={`nav-link-custom ${isActive('/orders') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <div className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center">
                <ShoppingCart className="me-3" size={20} />
                <span>Orders</span>
              </div>
              {isActive('/orders') ? null : renderBadge(orderCount)}
            </div>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/return-orders"
            className={`nav-link-custom ${isActive('/return-orders') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <RotateCcw className="me-3" size={20} />
            <span>Return Orders</span>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/coupons"
            className={`nav-link-custom ${isActive('/coupons') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <Tag className="me-3" size={20} />
            <span>Coupons</span>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/inquiries"
            className={`nav-link-custom ${isActive('/inquiries') ? 'active' : ''} text-decoration-none d-flex align-items-center justify-content-between`}
            onClick={onNavigate}
          >
            <div className="d-flex align-items-center">
              <Mail className="me-3" size={20} />
              <span>Inquiries</span>
            </div>
            {isActive('/inquiries') ? null : renderBadge(inquiryCount)}
          </Link>
        </Nav.Item>
        
        <Nav.Item>
          <Link
            to="/reviews"
            className={`nav-link-custom ${isActive('/reviews') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <div className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center">
                <MessageSquare className="me-3" size={20} />
                <span>Reviews</span>
              </div>
              {isActive('/reviews') ? null : renderBadge(reviewCount)}
            </div>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/users"
            className={`nav-link-custom ${isActive('/users') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <div className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center">
                <Users className="me-3" size={20} />
                <span>Users</span>
              </div>
              {isActive('/users') ? null : renderBadge(userCount)}
            </div>
          </Link>
        </Nav.Item>

        <Nav.Item>
          <Link
            to="/wholesalers"
            className={`nav-link-custom ${isActive('/wholesalers') ? 'active' : ''} text-decoration-none`}
            onClick={onNavigate}
          >
            <div className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center">
                <Briefcase className="me-3" size={20} />
                <span>Wholesalers</span>
              </div>
              {isActive('/wholesalers') ? null : renderBadge(wholesalerCount)}
            </div>
          </Link>
        </Nav.Item>

        {/* Settings Dropdown */}
        <Nav.Item>
          <div className="nav-item-wrapper">
            <div 
              className={`nav-link-custom ${openSettings ? 'active' : ''} d-flex justify-content-between align-items-center`}
              onClick={toggleSettings}
              style={{ cursor: 'pointer' }}
            >
              <div className="d-flex align-items-center">
                <Settings className="me-3" size={20} />
                <span>Settings</span>
              </div>
              {openSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            
            <Collapse in={openSettings}>
              <div className="mt-2 ms-4 ps-2">
                <Link
                    to="/profile"
                    className={`nav-link-custom py-2 mb-1 ${isActive('/profile') ? 'active' : ''} text-decoration-none`}
                    style={{ fontSize: '0.95rem' }}
                    onClick={onNavigate}
                >
                    <User className="me-3" size={18} />
                    <span>Profile Update</span>
                </Link>
                <Link
                    to="/change-password"
                    className={`nav-link-custom py-2 ${isActive('/change-password') ? 'active' : ''} text-decoration-none`}
                    style={{ fontSize: '0.95rem' }}
                    onClick={onNavigate}
                >
                    <KeyRound className="me-3" size={18} />
                    <span>Change Password</span>
                </Link>
              </div>
            </Collapse>
          </div>
        </Nav.Item>
      </Nav>
      
      <div className="mt-5 pt-3 border-top border-secondary border-opacity-25">
        <button
          onClick={logout}
          className="btn w-100 d-flex align-items-center justify-content-center logout-btn"
        >
          <LogOut className="me-2" size={18} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
