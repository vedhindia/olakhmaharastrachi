import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Alert, Form, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = '/api';

const UserProfile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profileType, setProfileType] = useState('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const normalizeDocuments = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const userToken = localStorage.getItem('userToken');
    const userInfoRaw = localStorage.getItem('userInfo');
    const wholesalerToken = localStorage.getItem('wholesalerToken');
    const wholesalerInfoRaw = localStorage.getItem('wholesalerInfo');

    if (userToken && userInfoRaw) {
      setProfileType('user');
      try {
        const parsed = JSON.parse(userInfoRaw);
        setUser(parsed);
        setName(parsed.name || '');
        setEmail(parsed.email || '');
        setPhone(parsed.phone || '');
        const storedAddress = localStorage.getItem('userAddress') || parsed.address || '';
        setAddress(storedAddress);
        setBusinessName(parsed.company_name || '');
        setGstNumber('');
        setApprovalStatus('');
        setCity(parsed.city || '');
        setStateName(parsed.state || '');
        setPincode(parsed.pincode || '');
        setIsVerified(false);
      } catch {
        setUser(null);
      }
      return;
    }

    if (wholesalerToken && wholesalerInfoRaw) {
      setProfileType('wholesaler');
      try {
        const parsed = JSON.parse(wholesalerInfoRaw);
        setUser(parsed);
        setName(parsed.name || '');
        setEmail(parsed.email || '');
        setPhone(parsed.phone || '');
        const storedAddress = localStorage.getItem('userAddress') || parsed.address || '';
        setAddress(storedAddress);
        setBusinessName(parsed.business_name || '');
        setGstNumber(parsed.gst_number || '');
        setApprovalStatus(parsed.status || '');
         setCity(parsed.city || '');
         setStateName(parsed.state || '');
         setPincode(parsed.pincode || '');
         setIsVerified(Boolean(parsed.is_verified));
         setSavedDocuments(normalizeDocuments(parsed.documents));
      } catch {
        setUser(null);
      }
      fetch(`${API_BASE}/wholesalers/profile`, {
        headers: { Authorization: `Bearer ${wholesalerToken}` }
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((profile) => {
          if (!profile) return;
          setUser(profile);
          localStorage.setItem('wholesalerInfo', JSON.stringify(profile));
          setName(profile.name || '');
          setEmail(profile.email || '');
          setPhone(profile.phone || '');
          setBusinessName(profile.business_name || '');
          setGstNumber(profile.gst_number || '');
          setApprovalStatus(profile.status || '');
          setCity(profile.city || '');
          setStateName(profile.state || '');
          setPincode(profile.pincode || '');
          setIsVerified(Boolean(profile.is_verified));
          setSavedDocuments(normalizeDocuments(profile.documents));
        })
        .catch(() => {});
      return;
    }

    navigate('/auth');
  }, [navigate]);

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (typeof localStorage === 'undefined') return;
    const userToken = localStorage.getItem('userToken');
    const wholesalerToken = localStorage.getItem('wholesalerToken');

    let token = null;
    let endpoint = `${API_BASE}/users/profile`;
    let storageKey = 'userInfo';

    if (profileType === 'wholesaler' && wholesalerToken) {
      token = wholesalerToken;
      endpoint = `${API_BASE}/wholesalers/profile`;
      storageKey = 'wholesalerInfo';
    } else if (userToken) {
      token = userToken;
      endpoint = `${API_BASE}/users/profile`;
      storageKey = 'userInfo';
    }

    if (!token) {
      navigate('/auth');
      return;
    }

    setSaving(true);
    try {
      const body =
        profileType === 'wholesaler'
          ? {
              name,
              email,
              phone,
              business_name: businessName,
              gst_number: gstNumber,
              address,
              city,
              state: stateName,
              pincode,
            }
          : {
              name,
              email,
              phone,
              company_name: businessName,
              address,
              city,
              state: stateName,
              pincode,
            };

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update profile');
      }

      const updatedUser =
        data.user || data.wholesaler || {
          ...(user || {}),
          name,
          email,
          phone,
          company_name: businessName,
          address,
          gst_number: gstNumber,
          city,
          state: stateName,
          pincode,
        };

      setUser(updatedUser);
      localStorage.setItem(storageKey, JSON.stringify(updatedUser));
      setBusinessName(updatedUser.business_name || updatedUser.company_name || '');
      setGstNumber(updatedUser.gst_number || '');
      setApprovalStatus(updatedUser.status || approvalStatus);
      setCity(updatedUser.city || '');
      setStateName(updatedUser.state || '');
      setPincode(updatedUser.pincode || '');
      setIsVerified(Boolean(updatedUser.is_verified));
      if (address) {
        localStorage.setItem('userAddress', address);
      }
      if (profileType === 'wholesaler' && documents && documents.length > 0) {
        const formData = new FormData();
        Array.from(documents).forEach((file) => formData.append('documents', file));

        const uploadResponse = await fetch(`${API_BASE}/wholesalers/profile/documents`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json().catch(() => null);
          throw new Error(uploadData?.message || 'Failed to upload documents');
        }
        setDocuments([]);
        const refreshed = await fetch(`${API_BASE}/wholesalers/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (refreshed) {
          setUser(refreshed);
          localStorage.setItem(storageKey, JSON.stringify(refreshed));
          setSavedDocuments(normalizeDocuments(refreshed.documents));
        }
        setMessage('Profile updated and documents uploaded successfully');
      } else {
        setMessage(data.message || 'Profile updated successfully');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while updating profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentsChange = (event) => {
    setDocuments(event.target.files);
  };

  if (!user) {
    return (
      <div className="py-5">
        <Container>
          <Row className="justify-content-center">
            <Col md={8} lg={6}>
              <div className="text-center text-warning">
                Please login to view your profile.{' '}
                <Link to="/auth">Go to Login / Register</Link>
              </div>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  return (
    <div className="py-5" style={{ backgroundColor: '#f7fbf2' }}>
      <Container>
        <Row className="justify-content-center mb-4">
          <Col md={8}>
            <h2 className="mb-3">My Profile</h2>
            <p className="text-muted mb-0">
              View your account information and manage your shopping activity.
            </p>
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className="shadow-sm border-0">
              <Card.Body>
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
                <Form onSubmit={handleSave}>
                  <Row>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileName">
                        <Form.Label className="text-muted small mb-1">Name</Form.Label>
                        <Form.Control
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Enter your name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileEmail">
                        <Form.Label className="text-muted small mb-1">Email</Form.Label>
                        <Form.Control
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="Enter your email"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profilePhone">
                        <Form.Label className="text-muted small mb-1">Phone</Form.Label>
                        <Form.Control
                          type="text"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Enter your phone"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                      <div className="mb-2 text-muted small">Customer Type</div>
                      <div className="fw-semibold">
                        {profileType === 'wholesaler' ? 'Wholesaler' : 'Retail Customer'}
                      </div>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileCompanyName">
                        <Form.Label className="text-muted small mb-1">Company Name</Form.Label>
                        <Form.Control
                          type="text"
                          value={businessName}
                          onChange={(event) => setBusinessName(event.target.value)}
                          placeholder="Enter your company name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileGstNumber">
                        <Form.Label className="text-muted small mb-1">GST Number</Form.Label>
                        <Form.Control
                          type="text"
                          value={gstNumber}
                          onChange={(event) => setGstNumber(event.target.value)}
                          placeholder="Enter your GST number"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6} className="mb-3">
                      <div className="mb-2 text-muted small">Approval Status</div>
                      <div className="fw-semibold text-capitalize">
                        {profileType === 'wholesaler' ? approvalStatus || 'pending' : '-'}
                      </div>
                    </Col>
                    <Col md={6} className="mb-3">
                      <div className="mb-2 text-muted small">Verification</div>
                      <div className="fw-semibold">
                        {profileType === 'wholesaler'
                          ? isVerified
                            ? 'Verified'
                            : 'Not Verified'
                          : '-'}
                      </div>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileAddress">
                        <Form.Label className="text-muted small mb-1">Address</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={address}
                          onChange={(event) => setAddress(event.target.value)}
                          placeholder="Enter your address"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                      <Form.Group controlId="profileCity">
                        <Form.Label className="text-muted small mb-1">City</Form.Label>
                        <Form.Control
                          type="text"
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                          placeholder="Enter your city"
                        />
                      </Form.Group>
                      <Form.Group controlId="profileState" className="mt-2">
                        <Form.Label className="text-muted small mb-1">State</Form.Label>
                        <Form.Control
                          type="text"
                          value={stateName}
                          onChange={(event) => setStateName(event.target.value)}
                          placeholder="Enter your state"
                        />
                      </Form.Group>
                      <Form.Group controlId="profilePincode" className="mt-2">
                        <Form.Label className="text-muted small mb-1">Pincode</Form.Label>
                        <Form.Control
                          type="text"
                          value={pincode}
                          onChange={(event) => setPincode(event.target.value)}
                          placeholder="Enter your pincode"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  {profileType === 'wholesaler' && (
                    <Row>
                      <Col md={12} className="mb-3">
                        <Form.Group controlId="wholesalerDocuments">
                          <Form.Label className="text-muted small mb-1">Upload Verification Documents</Form.Label>
                          <Form.Control type="file" multiple onChange={handleDocumentsChange} />
                          {savedDocuments.length > 0 && (
                            <div className="mt-2 small">
                              {savedDocuments
                                .map((doc, idx) => {
                                  const filename = typeof doc === 'string' ? doc : doc?.filename;
                                  if (!filename) return null;
                                  const label =
                                    typeof doc === 'string'
                                      ? doc
                                      : doc?.originalName || doc?.filename || `Document ${idx + 1}`;
                                  return (
                                    <div key={`${filename}-${idx}`}>
                                      <a href={`/api/uploads/${filename}`} target="_blank" rel="noreferrer">
                                        {label}
                                      </a>
                                    </div>
                                  );
                                })
                                .filter(Boolean)}
                            </div>
                          )}
                          {documents && documents.length > 0 && (
                            <div className="mt-2 small text-muted">
                              {Array.from(documents).map((file) => file.name).join(', ')}
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  )}
                  <div className="d-flex gap-2 mt-2">
                    <Button type="submit" variant="success" disabled={saving}>
                      {saving ? (
                        <>
                          <Spinner
                            as="span"
                            animation="border"
                            size="sm"
                            role="status"
                            aria-hidden="true"
                            className="me-2"
                          />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      onClick={() => {
                        setName(user.name || '');
                        setEmail(user.email || '');
                        setPhone(user.phone || '');
                        const storedAddress =
                          localStorage.getItem('userAddress') || user.address || '';
                        setAddress(storedAddress);
                        setDocuments([]);
                        setError('');
                        setMessage('');
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default UserProfile;
