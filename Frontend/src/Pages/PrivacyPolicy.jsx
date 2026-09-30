import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './Product.css';

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const website =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Privacy Policy</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <Link to="/" className="text-decoration-none text-white">
              Home
            </Link>
            <span className="dot">•</span>
            <span>Privacy Policy</span>
          </nav>
        </Container>
      </section>

      <section className="product-content py-5" style={{ backgroundColor: '#f7fbf2' }}>
        <Container>
          <Row className="justify-content-center">
            <Col lg={10}>
              <Card className="shadow-sm border-0">
                <Card.Body className="p-4 p-md-5">
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                    <div className="fw-bold fs-4">Privacy Policy</div>
                    <Button variant="outline-secondary" onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>

                  <div className="text-muted mb-4">
                    <div>
                      <span className="fw-semibold">Effective Date:</span> 24 Apr 2026
                    </div>
                    <div>
                      <span className="fw-semibold">Website:</span> {website || '—'}
                    </div>
                    <div>
                      <span className="fw-semibold">Company Name:</span> Ashoka
                    </div>
                  </div>

                  <p>
                    At Ashoka, we value your privacy and are committed to protecting your personal
                    information. This Privacy Policy explains how we collect, use, disclose, and
                    safeguard your information when you visit our eCommerce website and use our
                    services.
                  </p>

                  <h5 className="mt-4">1. Information We Collect</h5>
                  <p className="mb-2">We may collect the following types of information:</p>

                  <div className="fw-semibold mt-3">Personal Information</div>
                  <ul className="mb-3">
                    <li>Name</li>
                    <li>Email Address</li>
                    <li>Phone Number</li>
                    <li>Billing and Shipping Address</li>
                    <li>Payment Information (processed securely through payment gateways)</li>
                    <li>Account Login Credentials</li>
                  </ul>

                  <div className="fw-semibold mt-3">Non-Personal Information</div>
                  <ul>
                    <li>IP Address</li>
                    <li>Browser Type</li>
                    <li>Device Information</li>
                    <li>Cookies and Usage Data</li>
                    <li>Website Interaction Data</li>
                  </ul>

                  <h5 className="mt-4">2. How We Use Your Information</h5>
                  <p className="mb-2">We use your information to:</p>
                  <ul>
                    <li>Process and deliver orders</li>
                    <li>Manage your account</li>
                    <li>Provide customer support</li>
                    <li>Improve website functionality and user experience</li>
                    <li>Send order updates and notifications</li>
                    <li>Share promotional offers (with your consent)</li>
                    <li>Prevent fraud and enhance security</li>
                    <li>Comply with legal obligations</li>
                  </ul>

                  <h5 className="mt-4">3. Payment Security</h5>
                  <p>
                    We do not store your debit/credit card details on our servers. Payments are
                    processed securely through trusted third-party payment gateways such as Razorpay,
                    PayPal, or other secure providers.
                  </p>

                  <h5 className="mt-4">4. Cookies</h5>
                  <p className="mb-2">Our website may use cookies to:</p>
                  <ul>
                    <li>Remember your preferences</li>
                    <li>Improve browsing experience</li>
                    <li>Analyze traffic and performance</li>
                    <li>Provide personalized recommendations</li>
                  </ul>
                  <p>You can disable cookies through your browser settings.</p>

                  <h5 className="mt-4">5. Sharing of Information</h5>
                  <p className="mb-2">We do not sell, rent, or trade your personal information.</p>
                  <p className="mb-2">We may share information with:</p>
                  <ul>
                    <li>Delivery and logistics partners</li>
                    <li>Payment processors</li>
                    <li>Service providers assisting in website operations</li>
                    <li>Legal authorities if required by law</li>
                  </ul>

                  <h5 className="mt-4">6. Data Protection</h5>
                  <p>
                    We implement appropriate security measures to protect your personal information
                    against unauthorized access, loss, misuse, or disclosure.
                  </p>

                  <h5 className="mt-4">7. Your Rights</h5>
                  <p className="mb-2">You may have the right to:</p>
                  <ul>
                    <li>Access your personal data</li>
                    <li>Correct inaccurate information</li>
                    <li>Request deletion of your data</li>
                    <li>Withdraw consent for marketing communications</li>
                    <li>Request information about how your data is used</li>
                  </ul>
                  <p className="mb-0">
                    For requests, contact us at: <span className="fw-semibold">ashokproducts.sales@gmail.com</span>
                  </p>

                  <h5 className="mt-4">8. Third-Party Links</h5>
                  <p>
                    Our website may contain links to third-party websites. We are not responsible for
                    their privacy practices.
                  </p>

                  <h5 className="mt-4">9. Children&apos;s Privacy</h5>
                  <p>
                    Our services are not intended for individuals under 18 years of age. We do not
                    knowingly collect information from children.
                  </p>

                  <h5 className="mt-4">10. Changes to This Privacy Policy</h5>
                  <p>
                    We may update this policy from time to time. Changes will be posted on this page
                    with a revised effective date.
                  </p>

                  <h5 className="mt-4">11. Contact Us</h5>
                  <p className="mb-2">
                    If you have any questions regarding this Privacy Policy, contact us:
                  </p>
                  <div className="mb-1">
                    <span className="fw-semibold">Ashoka</span>
                  </div>
                  <div className="text-muted">
                    GAT NO 1567, Near Shelar Crane Service Shelarvasti, Chikhali, Maharashtra – 411062
                  </div>
                  <div className="text-muted">
                    Email: ashokproducts.sales@gmail.com
                  </div>
                  <div className="text-muted">Phone: +91 99709 30890</div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
