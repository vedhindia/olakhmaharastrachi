import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import './AuthForms.css';

const API_BASE = '/api';

const WholesalerRegister = () => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [documents, setDocuments] = useState([]);
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSendOtp = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email && !phone) {
      setError('Please enter email or phone');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/wholesaler-auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, phone, mode: 'register' }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      setStep(2);
      setMessage(data.message || 'OTP sent successfully');
    } catch (err) {
      setError(err.message || 'Something went wrong');
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
      const verifyForm = new FormData();
      if (email) verifyForm.append('email', email);
      if (phone) verifyForm.append('phone', phone);
      verifyForm.append('otp', otp);
      if (name) verifyForm.append('name', name);
      if (address) verifyForm.append('address', address);
      if (documents && documents.length > 0) {
        Array.from(documents).forEach((file) => verifyForm.append('documents', file));
      }

      const response = await fetch(`${API_BASE}/wholesaler-auth/verify-otp`, {
        method: 'POST',
        body: verifyForm,
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to verify OTP');
      }

      if (data.token) {
        localStorage.setItem('wholesalerToken', data.token);
      }
      if (data.wholesaler) {
        const updatedWholesaler = {
          ...data.wholesaler,
          name,
          email: email || data.wholesaler.email,
          phone: phone || data.wholesaler.phone,
          address,
        };
        localStorage.setItem('wholesalerInfo', JSON.stringify(updatedWholesaler));
      }
      if (documents && documents.length > 0) {
        const names = Array.from(documents).map((file) => file.name);
        localStorage.setItem('wholesalerDocuments', JSON.stringify(names));
      }

      if (data.token) {
        fetch(`${API_BASE}/wholesalers/profile`, {
          headers: { Authorization: `Bearer ${data.token}` }
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((profile) => {
            if (!profile) return;
            localStorage.setItem('wholesalerInfo', JSON.stringify(profile));
          })
          .catch(() => {});
      }

      setMessage(data.message || 'Registration submitted. Your account will be reviewed.');
      navigate('/wholesaler-dashboard');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentsChange = (event) => {
    setDocuments(event.target.files);
  };

  return (
    <div className="auth-form-page">
      <Container>
        <Row className="justify-content-center">
          <Col md={7} lg={6}>
            <div className="auth-form-card">
            <h2 className="auth-form-title text-center">Wholesaler Registration</h2>
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
                <>
                  <Form.Group className="mb-3" controlId="wholesalerRegisterName">
                    <Form.Label>Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Enter your name"
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="wholesalerRegisterAddress">
                    <Form.Label>Address</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Enter your address"
                    />
                  </Form.Group>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3" controlId="wholesalerRegisterEmail">
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="Enter your email"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3" controlId="wholesalerRegisterPhone">
                        <Form.Label>Phone</Form.Label>
                        <Form.Control
                          type="text"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Enter your phone number"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3" controlId="wholesalerRegisterDocuments">
                    <Form.Label>Upload Documents</Form.Label>
                    <Form.Control
                      type="file"
                      multiple
                      onChange={handleDocumentsChange}
                    />
                    {documents && documents.length > 0 && (
                      <div className="mt-2 small text-muted">
                        {Array.from(documents).map((file) => file.name).join(', ')}
                      </div>
                    )}
                  </Form.Group>
                </>
              )}
              {step === 2 && (
                <>
                  <Form.Group className="mb-3" controlId="wholesalerRegisterOtp">
                    <Form.Label>OTP</Form.Label>
                    <Form.Control
                      type="text"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      placeholder="Enter the OTP sent to your email or phone"
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
                  'Complete Registration'
                )}
              </Button>
            </Form>
            <div className="mt-3 text-center">
              <span className="text-muted">Already registered?</span>{' '}
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

export default WholesalerRegister;
