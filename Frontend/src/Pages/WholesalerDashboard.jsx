import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';

const WholesalerDashboard = () => {
  return (
    <div className="py-5">
      <Container>
        <Row className="justify-content-center">
          <Col md={8} lg={7}>
            <h2 className="mb-3 text-center">Wholesaler Dashboard</h2>
            <p className="text-muted text-center mb-4">
              Welcome to the wholesaler area. Dashboard features will be available here in
              the future.
            </p>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default WholesalerDashboard;

