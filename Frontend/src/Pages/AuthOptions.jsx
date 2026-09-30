import React from 'react';
import { Container, Row, Col, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { User, Store } from 'lucide-react';
import './AuthOptions.css';

const AuthOptions = () => {
  return (
    <div className="auth-options-page">
      <Container>
        <Row className="justify-content-center mb-4">
          <Col lg={8} className="text-center">
            <h1 className="auth-title">Login</h1>
            <p className="auth-subtitle">
              Choose how you want to access your account or create a new one.
            </p>
          </Col>
        </Row>

        <Row className="g-4 justify-content-center">
          <Col md={6} lg={5}>
            <div className="auth-card">
              <div className="auth-icon-circle">
                <User size={26} />
              </div>
              <h4 className="auth-card-title">User</h4>
              <p className="auth-card-text">
                For regular customers shopping on Ashoka.
              </p>
              <div className="auth-card-actions">
                <Button as={Link} to="/login" className="auth-primary-btn text-center">
                  User Login
                </Button>
                <Button as={Link} to="/register" className="auth-secondary-btn text-center">
                  User Registration
                </Button>
              </div>
            
            </div>
          </Col>

          <Col md={6} lg={5}>
            <div className="auth-card">
              <div className="auth-icon-circle">
                <Store size={26} />
              </div>
              <h4 className="auth-card-title">Wholesaler</h4>
              <p className="auth-card-text">
                For wholesale partners and bulk purchasing.
              </p>
              <div className="auth-card-actions">
                <Button as={Link} to="/wholesaler-login" className="auth-primary-btn text-center">
                  Wholesaler Login
                </Button>
                <Button as={Link} to="/wholesaler-register" className="auth-secondary-btn text-center">
                  Wholesaler Registration
                </Button>
              </div>
             
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default AuthOptions;

