import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './Product.css';

const ReturnPolicy = () => {
  const navigate = useNavigate();
  const website =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';

  return (
    <div className="product-page">
      <section className="product-banner text-center text-white py-5">
        <Container>
          <h1 className="banner-title display-4 fw-bold mb-3">Return Policy</h1>
          <nav className="breadcrumb-nav d-flex justify-content-center align-items-center gap-2">
            <Link to="/" className="text-decoration-none text-white">
              Home
            </Link>
            <span className="dot">•</span>
            <span>Return Policy</span>
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
                    <div className="fw-bold fs-4">Return Policy</div>
                    <Button variant="outline-secondary" onClick={() => navigate('/')}>
                      Cancel
                    </Button>
                  </div>

                  <div className="text-muted mb-4">
                    This Return Policy explains when and how you can return products purchased from{' '}
                    <span className="fw-semibold">Ashoka</span>
                    {website ? (
                      <>
                        {' '}
                        via <span className="fw-semibold">{website}</span>
                      </>
                    ) : null}
                    .
                  </div>

                  <h5>1. Return Window</h5>
                  <p className="mb-2">
                    You can request a return within <span className="fw-semibold">7 days</span> of delivery, unless a
                    different return window is shown on the product page.
                  </p>

                  <h5 className="mt-4">2. Eligibility</h5>
                  <p className="mb-2">A return is eligible if the product is:</p>
                  <ul>
                    <li>Unused, unwashed, and in resalable condition</li>
                    <li>Returned with original packaging, tags, and accessories (if any)</li>
                    <li>Returned with invoice / order details</li>
                    <li>Not damaged due to misuse, negligence, or improper handling</li>
                  </ul>

                  <h5 className="mt-4">3. Non-Returnable Items</h5>
                  <p className="mb-2">Returns may not be accepted for:</p>
                  <ul>
                    <li>Products marked as non-returnable on the product page</li>
                    <li>Items with missing parts, original packaging, or accessories</li>
                    <li>Products damaged after delivery due to customer handling</li>
                    <li>Custom / special-order items (if applicable)</li>
                  </ul>

                  <h5 className="mt-4">4. How to Request a Return</h5>
                  <p className="mb-2">To request a return:</p>
                  <ul>
                    <li>Go to your account and open the order details</li>
                    <li>Select the product and choose “Return”</li>
                    <li>Provide a reason and (if asked) upload photos</li>
                    <li>Our team will confirm pickup / return instructions</li>
                  </ul>

                  <h5 className="mt-4">5. Pickup and Shipping</h5>
                  <p className="mb-0">
                    If pickup is available for your location, we will arrange pickup. If not, we will share a return
                    address and process the return after we receive the product.
                  </p>

                  <h5 className="mt-4">6. Refunds</h5>
                  <p className="mb-2">
                    After the returned product passes inspection, we will initiate a refund to your original payment
                    method or another method as permitted.
                  </p>
                  <ul>
                    <li>Online payments: refund is initiated to the original payment method</li>
                    <li>Cash on delivery: refund may be processed to bank account / UPI after confirmation</li>
                  </ul>

                  <h5 className="mt-4">7. Deductions</h5>
                  <p className="mb-0">
                    Shipping or handling charges may be deducted if the return is due to customer preference (e.g.
                    “ordered by mistake”) or if the product is not returned in the original condition.
                  </p>

                  <h5 className="mt-4">8. Cancellations</h5>
                  <p className="mb-0">
                    If your order has not been shipped, you may request cancellation. If it has already shipped, please
                    follow the return process after delivery.
                  </p>

                  <h5 className="mt-4">9. Contact Us</h5>
                  <p className="mb-2">If you need help with returns, contact us:</p>
                  <div className="mb-1">
                    <span className="fw-semibold">Ashoka</span>
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

export default ReturnPolicy;
