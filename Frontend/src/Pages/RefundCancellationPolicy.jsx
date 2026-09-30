import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './Product.css';

const RefundCancellationPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Refund &amp; Cancellation Policy</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <Link to="/" className="text-decoration-none text-white">
              Home
            </Link>
            <span className="dot">•</span>
            <span>Refund &amp; Cancellation Policy</span>
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
                    <div className="fw-bold fs-4">Refund &amp; Cancellation Policy</div>
                    <Button variant="outline-secondary" onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>

                  <p>
                    At Ashoka Products, we strive to provide high-quality products and excellent
                    customer service. Please read our Refund &amp; Cancellation Policy carefully before
                    placing an order.
                  </p>

                  <h5 className="mt-4">1. Order Cancellation</h5>
                  <ul>
                    <li>Orders can be cancelled before they are dispatched from our warehouse.</li>
                    <li>Once the order has been shipped, cancellation requests may not be accepted.</li>
                    <li>
                      To request cancellation, please contact our customer support team with your
                      order details.
                    </li>
                  </ul>

                  <h5 className="mt-4">2. Refund Policy</h5>
                  <p className="mb-2">Refunds may be initiated under the following circumstances:</p>
                  <ul>
                    <li>Product received is damaged during transit.</li>
                    <li>Wrong product delivered.</li>
                    <li>Product is missing from the order.</li>
                    <li>Order cancelled before dispatch.</li>
                  </ul>

                  <h5 className="mt-4">3. Refund Process</h5>
                  <ul>
                    <li>Customers must notify us within 48 hours of receiving the order.</li>
                    <li>Supporting photographs of the product and packaging may be required.</li>
                    <li>Once the request is approved, the refund will be processed within 5-7 business days.</li>
                    <li>
                      Refunds will be credited to the original payment method used during the
                      purchase.
                    </li>
                  </ul>

                  <h5 className="mt-4">4. Non-Refundable Situations</h5>
                  <p className="mb-2">Refunds will not be provided for:</p>
                  <ul>
                    <li>Products damaged due to misuse or improper handling by the customer.</li>
                    <li>Requests made after the specified reporting period.</li>
                    <li>Minor packaging variations that do not affect product quality.</li>
                  </ul>

                  <h5 className="mt-4">5. Contact Us</h5>
                  <p className="mb-2">For any refund or cancellation-related queries, please contact:</p>
                  <div className="mb-1">
                    <span className="fw-semibold">Ashoka Products</span>
                  </div>
                  <div className="text-muted">Email: ashokaproducts.sales@gmail.com</div>
                  <div className="text-muted">
                    Phone: +91 99709 30890 / +91 88881 88194
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </section>
    </div>
  );
};

export default RefundCancellationPolicy;
