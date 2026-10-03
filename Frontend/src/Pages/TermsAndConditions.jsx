import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './Product.css';

const TermsAndConditions = () => {
  const navigate = useNavigate();
  const website =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Terms &amp; Conditions</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <Link to="/" className="text-decoration-none text-white">
              Home
            </Link>
            <span className="dot">•</span>
            <span>Terms &amp; Conditions</span>
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
                    <div className="fw-bold fs-4">Terms &amp; Conditions</div>
                    <Button variant="outline-secondary" onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>

                  <div className="text-muted mb-4">
                    These Terms &amp; Conditions govern your access to and use of{' '}
                    <span className="fw-semibold">Ashoka</span>
                    {website ? (
                      <>
                        {' '}
                        via <span className="fw-semibold">{website}</span>
                      </>
                    ) : null}
                    . By using the website, you agree to these terms.
                  </div>

                  <h5>1. Eligibility</h5>
                  <p className="mb-0">
                    You must be at least 18 years old (or the age of majority in your jurisdiction) to place an order.
                  </p>

                  <h5 className="mt-4">2. Account and Security</h5>
                  <ul>
                    <li>You are responsible for maintaining the confidentiality of your login information.</li>
                    <li>You agree to provide accurate information and keep it updated.</li>
                    <li>We may suspend accounts for suspected fraud or policy violations.</li>
                  </ul>

                  <h5 className="mt-4">3. Products, Pricing and Availability</h5>
                  <ul>
                    <li>Product images are for reference; actual color/packaging may vary.</li>
                    <li>Prices and availability may change without notice.</li>
                    <li>We may limit quantities per customer or cancel orders for incorrect pricing or stock issues.</li>
                  </ul>

                  <h5 className="mt-4">4. Orders and Payments</h5>
                  <ul>
                    <li>Order confirmation does not guarantee acceptance; we may cancel orders after verification.</li>
                    <li>Payments are processed through trusted payment partners for online payments.</li>
                    <li>For cash-on-delivery orders, availability depends on serviceable area and order value.</li>
                  </ul>

                  <h5 className="mt-4">5. Shipping and Delivery</h5>
                  <ul>
                    <li>Delivery timelines are estimates and may vary due to logistics or external factors.</li>
                    <li>Please ensure your delivery address and contact details are correct.</li>
                    <li>Risk of loss passes to you upon delivery.</li>
                  </ul>

                  <h5 className="mt-4">6. Returns and Refunds</h5>
                  <p className="mb-0">
                    Returns and refunds are subject to our <Link to="/return-policy">Return Policy</Link>.
                  </p>

                  <h5 className="mt-4">7. Wholesaler Accounts</h5>
                  <ul>
                    <li>Wholesaler verification is subject to approval by the admin.</li>
                    <li>We may request supporting documents for verification.</li>
                    <li>Wholesaler pricing and availability may differ from retail pricing.</li>
                  </ul>

                  <h5 className="mt-4">8. Prohibited Use</h5>
                  <p className="mb-2">You agree not to:</p>
                  <ul>
                    <li>Use the website for any unlawful purpose</li>
                    <li>Attempt to access accounts or data without authorization</li>
                    <li>Interfere with site operations, security, or performance</li>
                    <li>Upload malicious code or misuse forms and content</li>
                  </ul>

                  <h5 className="mt-4">9. Intellectual Property</h5>
                  <p className="mb-0">
                    All content on the website (logos, text, graphics, and design) is owned by Olakh Maharashtrachi or licensed to us.
                    You may not copy or reuse content without permission.
                  </p>

                  <h5 className="mt-4">10. Limitation of Liability</h5>
                  <p className="mb-0">
                    To the maximum extent permitted by law, Olakh Maharashtrachi will not be liable for indirect or consequential
                    losses arising from the use of the website or products.
                  </p>

                  <h5 className="mt-4">11. Changes to These Terms</h5>
                  <p className="mb-0">
                    We may update these Terms &amp; Conditions from time to time. Changes will be posted on this page.
                  </p>

                  <h5 className="mt-4">12. Contact Us</h5>
                  <p className="mb-2">If you have any questions about these Terms, contact us:</p>
                  <div className="mb-1">
                    <span className="fw-semibold">Olakh Maharashtrachi</span>
                  </div>
                  <div className="text-muted">
                    GAT NO 1567, Near Shelar Crane Service Shelarvasti, Chikhali, Maharashtra – 411062
                  </div>
                  <div className="text-muted">Email: ashokproducts.sales@gmail.com</div>
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

export default TermsAndConditions;
