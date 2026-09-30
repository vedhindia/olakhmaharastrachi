import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import './AuthForms.css';

const API_BASE = '/api';

const UserLogin = () => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSendOtp = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/user-auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, mode: 'login' }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      setStep(2);
      setMessage(data.message || 'OTP sent successfully');
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      setError(msg);
      const lower = msg.toLowerCase();
      if (
        lower.includes('no account found') ||
        lower.includes('registration is mandatory') ||
        lower.includes('please register')
      ) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app:toast', {
              detail: { message: 'Please register first', variant: 'danger' },
            }),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/user-auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to verify OTP');
      }

      if (data.token) {
        localStorage.setItem('userToken', data.token);
      }
      if (data.user) {
        localStorage.setItem('userInfo', JSON.stringify(data.user));
      }

      setMessage(data.message || 'Login successful');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-page">
      <Container>
        <Row className="justify-content-center">
          <Col md={6} lg={5}>
            <div className="auth-form-card">
            <h2 className="auth-form-title text-center">User Login</h2>
            {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}
          {message && (
            <Alert variant="success" className="mb-3">
              {message}
            </Alert>
          )}
            <Form onSubmit={step === 1 ? handleSendOtp : handleVerifyOtp}>
              {step === 1 && (
                <Form.Group className="mb-3" controlId="userLoginEmail">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your email"
                  />
                </Form.Group>
              )}
              {step === 2 && (
                <>
                  <Form.Group className="mb-3" controlId="userLoginEmailReadonly">
                    <Form.Label>Email</Form.Label>
                    <Form.Control type="email" value={email} disabled />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="userLoginOtp">
                    <Form.Label>OTP</Form.Label>
                    <Form.Control
                      type="text"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      placeholder="Enter the OTP"
                      maxLength={6}
                    />
                  </Form.Group>
                </>
              )}
              <Button type="submit" variant="dark" className="w-100" disabled={loading}>
                {loading ? (
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                ) : step === 1 ? (
                  'Send OTP'
                ) : (
                  'Verify OTP'
                )}
              </Button>
            </Form>
            <div className="mt-3 text-center">
              <span className="text-muted">Wholesaler?</span>{' '}
              <Link to="/wholesaler-login">Login here</Link>
            </div>
            <div className="mt-2 text-center">
              <Link to="/auth" className="text-muted small">
                Back to login options
              </Link>
            </div>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default UserLogin;
