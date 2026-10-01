import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { Truck, RotateCcw, Headphones, ShieldCheck, MapPin, Phone, Facebook, Twitter, Linkedin, Instagram, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Footer.css';
import logo from '../assets/images/logoo.png';

const Footer = () => {
  return (
    <footer className="site-footer mt-5 ">
      <div className="service-strip mb-4">
        <Container>
          <Row className="g-4">
            <Col lg={3} md={6}>
              <div className="service-item">
                <div className="icon-wrap"><Truck size={22} /></div>
                <div>
                  <h6 className="service-title">Free Delivery</h6>
                  <div className="service-text">Free shipping on all order</div>
                </div>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="service-item">
                <div className="icon-wrap"><RotateCcw size={22} /></div>
                <div>
                  <h6 className="service-title">Money Return</h6>
                  <div className="service-text">Back guarantee under 7 day</div>
                </div>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="service-item">
                <div className="icon-wrap"><Headphones size={22} /></div>
                <div>
                  <h6 className="service-title">Online Support 24/7</h6>
                  <div className="service-text">Support online 24 hours a day</div>
                </div>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="service-item">
                <div className="icon-wrap"><ShieldCheck size={22} /></div>
                <div>
                  <h6 className="service-title">Reliable</h6>
                  <div className="service-text">Trusted by 1000+ brands</div>
                </div>
              </div>
            </Col>
          </Row>
        </Container>
      </div>

      <div className="footer-main">
        <Container>
          <Row className="g-4">
            <Col lg={4} md={12}>
              <div className="brand-block">
                <img src={logo} alt="Ashoka" className="footer-logo" />
                <p className="brand-text">Ashoka Products is committed to delivering premium-quality food products with purity, hygiene, and customer satisfaction.</p>
                <div className="socials">
                  <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook" className="social-btn"><Facebook size={18} /></a>
                  <a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="Twitter" className="social-btn"><Twitter size={18} /></a>
                  <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="social-btn"><Linkedin size={18} /></a>
                  <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram" className="social-btn"><Instagram size={18} /></a>
                </div>
              </div>
            </Col>
            <Col lg={2} md={3} xs={6}>
              <div className="link-block">
                <h6 className="block-title">Services</h6>
                <ul className="footer-links">
                  <li><Link to="/auth">Log In</Link></li>
                  <li><Link to="/wishlist">Wishlist</Link></li>
                  <li><Link to="/return-policy">Return Policy</Link></li>
                  <li><Link to="/about#testimonials">Testimonial</Link></li>
                  <li><Link to="/about#faqs">Shopping FAQs</Link></li>
                  <li><Link to="/privacy-policy">Privacy policy</Link></li>
                  <li><Link to="/shipping-delivery-policy">Shipping &amp; Delivery Policy</Link></li>
                  <li><Link to="/refund-cancellation-policy">Refund &amp; Cancellation Policy</Link></li>
                </ul>
              </div>
            </Col>
            <Col lg={2} md={3} xs={6}>
              <div className="link-block">
                <h6 className="block-title">Company</h6>
                <ul className="footer-links">
                  <li><Link to="/">Home</Link></li>
                  <li><Link to="/about">About us</Link></li>
                  <li><Link to="/about#how-it-works">How it works</Link></li>
                  <li><Link to="/product">Shop</Link></li>
                  <li><Link to="/about#updates">Updates</Link></li>
                  <li><Link to="/contact">Contact us</Link></li>
                </ul>
              </div>
            </Col>
            <Col lg={4} md={6} sm={12}>
              <div className="contact-block">
                <h6 className="block-title">Contact</h6>
                <div className="contact-line">
                  KRV Capital Building, 2nd-floor
                </div>
                <div className="contact-item">
                  <div className="contact-icon"><MapPin size={16} /></div>
                  <div>
                    Shop No.205, Oppe Runwal Classic,
                    Tapkir Chowk, Kaiwadi Main Raod, Maharashtra 411017
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon"><Phone size={16} /></div>
                  <div>
                    <a href="tel:+917057286411" className="text-decoration-none text-reset">+91 70572 86411</a>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon"><Mail size={16} /></div>
                  <div>
                    <a href="mailto:omksarsatpute2006@gmail.com" className="text-decoration-none text-reset">omksarsatpute2006@gmail.com</a>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
          <div className="footer-sep" />
          <Row className="align-items-center">
            <Col md={6}>
              <div className="copyright">© All Copyright 2024 by Ashoka</div>
            </Col>
            <Col md={6}>
              <div className="foot-links">
                <Link to="/terms-and-conditions">Terms & Condition</Link>
                <span className="dot">•</span>
                <Link to="/privacy-policy">Privacy Policy</Link>
              </div>
            </Col>
          </Row>
        </Container>
      </div>
    </footer>
  );
};

export default Footer;
