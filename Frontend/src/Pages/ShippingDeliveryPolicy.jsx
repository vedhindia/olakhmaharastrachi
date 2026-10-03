import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './Product.css';

const ShippingDeliveryPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Shipping &amp; Delivery Policy</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <Link to="/" className="text-decoration-none text-white">
              Home
            </Link>
            <span className="dot">•</span>
            <span>Shipping &amp; Delivery Policy</span>
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
                    <div className="fw-bold fs-4">Shipping &amp; Delivery Policy</div>
                    <Button variant="outline-secondary" onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>

                  <p>Thank you for shopping with Olakh Maharashtrachi.</p>

                  <h5 className="mt-4">1. Order Processing</h5>
                  <ul>
                    <li>Orders are processed within 1-2 business days after successful payment confirmation.</li>
                    <li>Orders placed on weekends or public holidays will be processed on the next working day.</li>
                  </ul>

                  <h5 className="mt-4">2. Shipping Coverage</h5>
                  <ul>
                    <li>We currently deliver across India.</li>
                    <li>Delivery availability may vary depending on the serviceability of the customer&apos;s location.</li>
                  </ul>

                  <h5 className="mt-4">3. Delivery Timeline</h5>
                  <ul>
                    <li>Standard delivery typically takes 3-7 business days.</li>
                    <li>Delivery timelines may vary based on location, weather conditions, or courier partner delays.</li>
                  </ul>

                  <h5 className="mt-4">4. Shipping Charges</h5>
                  <ul>
                    <li>Shipping charges, if applicable, will be displayed during checkout before payment.</li>
                    <li>Promotional offers with free shipping may be available from time to time.</li>
                  </ul>

                  <h5 className="mt-4">5. Order Tracking</h5>
                  <ul>
                    <li>Once the order is shipped, tracking details will be shared via email, SMS, or WhatsApp (where applicable).</li>
                  </ul>

                  <h5 className="mt-4">6. Delayed Deliveries</h5>
                  <p className="mb-0">
                    While we strive to deliver orders within the estimated timeline, delays caused by courier services,
                    natural events, or unforeseen circumstances may occur.
                  </p>

                  <h5 className="mt-4">7. Contact Us</h5>
                  <p className="mb-2">For shipping-related assistance, please contact:</p>
                  <div className="mb-1">
                    <span className="fw-semibold">Olakh Maharashtrachi</span>
                  </div>
                  <div className="text-muted">Email: ashokaproducts.sales@gmail.com</div>
                  <div className="text-muted">Phone: +91 99709 30890 / +91 88881 88194</div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </section>
    </div>
  );
};

export default ShippingDeliveryPolicy;
