import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import "./About.css";
import productImg from "../assets/images/aboutus.jpg";
import aboutHero from "../assets/images/1920X500.jpg";
import bg from "../assets/images/bg.png";
import fssaiLogo from "../assets/images/fassi logo.png";
import keepCleanLogo from "../assets/images/keep clean logo.png";
import makeInIndiaLogo from "../assets/images/make in india logo.png";
import swachBharatLogo from "../assets/images/swach bharat.png";
import foodManufacturingLogo from "../assets/images/food manufacturing.png";

const journeySteps = [
  { icon: "🌱", title: "Founded", desc: "Founded with a vision of purity" },
  { icon: "🏭", title: "Modern Facility", desc: "Modern manufacturing setup" },
  { icon: "📦", title: "Expanded Range", desc: "Expanded product range" },
  { icon: "🏆", title: "Trusted Brand", desc: "Trusted by thousands of customers" },
];

const diffCards = [
  { icon: "🌾", title: "Farm-Sourced Ingredients", desc: "Best grains harvested from top farms" },
  { icon: "🔍", title: "Quality Tested & Certified", desc: "Rigorous quality checks for purity" },
  { icon: "⚙️", title: "Modern Processing", desc: "Advanced facilities ensure hygiene" },
  { icon: "💚", title: "Customer-First Approach", desc: "Your needs and feedback matter most." },
];

export default function About() {
  return (
    <div className="about-page">
      <section
        className="hero"
        style={{
          backgroundImage: `url(${aboutHero})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* ── Who We Are ── */}
      <section className="who">
        <Container>
          <Row className="align-items-center">
            <Col md={6}>
              <div className="who__text">
                <h2 className="section-title">Who We Are</h2>
                <p>
                 We are a quality-focused food brand committed to preserving the authentic taste of Indian kitchens. Specializing in premium Chana Besan (Gram Flour), we use only 100% desi chickpeas, carefully sourced and processed using traditional slow-grinding methods to retain their natural aroma, rich nutty flavor, and nutritional value.
                </p>
                <p >
                 For us, chana besan is more than just an ingredient—it is the golden foundation of everyday cooking. Our product is pure and unadulterated, made with zero fillers, zero additives, and no preservatives, ensuring consistent quality and trust in every pack.
                </p>
                <p>Naturally rich in plant-based protein, dietary fiber, and iron, our besan supports both taste and nutrition. Its fine texture and versatility make it ideal for crispy pakoras, smooth kadhi, fluffy dhokla, and melt-in-the-mouth sweets.</p>
              </div>
            </Col>
            <Col md={6}>
              <div className="who__imgs">
                <div className="who__img-main">
                  <img
                    src={productImg}
                    alt="Farmers"
                  />
                </div>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      {/* ── Our Journey ── */}
      <section className="journey">
        <h2 className="section-title">Our Journey</h2>
        <div className="journey__track">
          <div className="journey__line" />
          {journeySteps.map((s, i) => (
            <div className="journey__step" key={i}>
              <div className="journey__circle">{s.icon}</div>
              <h4 className="journey__step-title">{s.title}</h4>
              <p className="journey__step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vm">
        <h2 className="section-title with-line">Vision & Mission</h2>
        <div className="vm__grid">
          <div className="vm__card">
            <h3 className="vm__title">Vision</h3>
            <p>
              To be India’s most trusted food products brand, connecting homes with pure,
              naturally processed ingredients that nourish families every day.
            </p>
          </div>
          <div className="vm__card">
            <h3 className="vm__title">Mission</h3>
            <ul className="vm__list">
              <li>Adopt rigorous sourcing and quality practices.</li>
              <li>Maintain hygienic processing and modern packaging.</li>
              <li>Continuously improve with a customer‑first mindset.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── What Makes Ashoka Different ── */}
      <section className="diff">
        <h2 className="section-title with-line">What Makes Ashoka Different</h2>
        <div className="diff__grid">
          {diffCards.map((c, i) => (
            <div className="diff__card" key={i}>
              <div className="diff__icon">{c.icon}</div>
              <h4>{c.title}</h4>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="py-4"
        style={{
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <Container>
          <Row className="g-5 justify-content-center align-items-center text-center py-4">
            <Col xs="auto">
              <img src={fssaiLogo} alt="FSSAI" style={{ height: 54, width: "auto" }} />
            </Col>
            <Col xs="auto">
              <img src={keepCleanLogo} alt="Keep Clean" style={{ height: 54, width: "auto" }} />
            </Col>
            <Col xs="auto">
              <img src={makeInIndiaLogo} alt="Make in India" style={{ height: 54, width: "auto" }} />
            </Col>
            <Col xs="auto">
              <img src={swachBharatLogo} alt="Swachh Bharat" style={{ height: 54, width: "auto" }} />
            </Col>
            <Col xs="auto">
              <img src={foodManufacturingLogo} alt="Food Manufacturing" style={{ height: 54, width: "auto" }} />
            </Col>
          </Row>
        </Container>
      </section>

    </div>
  );
}
