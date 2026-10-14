import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import "./About.css";
import productImg from "../assets/images/aboutus.png";
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
  { icon: "🌾", title: "Traditional Maharashtrian Products", desc: "Discover authentic sweets, snacks, and regional specialities." },
  { icon: "🔍", title: "Authentic Taste & Quality", desc: "Celebrating genuine flavours rooted in Maharashtra’s heritage." },
  { icon: "⚙️", title: "Traditional Recipes & Craft", desc: "Preserving age-old recipes and culinary traditions." },
  { icon: "💚", title: "Customer-Centric Approach", desc: "Sharing our rich food culture and flavours with every generation.." },
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
                <h5>Maharashtrachi Olakh – A Taste of Tradition, A Celebration of Heritage.

</h5>
                <p>
Maharashtra is a land of rich traditions, vibrant culture, and unforgettable flavours. At Maharashtrachi Olakh, we celebrate the authentic taste of Maharashtra through its traditional sweets, delicious snacks, and aromatic spices.                </p>
                <p >
From the sweetness of festive delicacies to the distinctive flavours of traditional Maharashtrian cuisine, we aim to preserve and showcase the culinary heritage that connects generations. Every flavour tells a story, every recipe carries a tradition, and every taste reflects the true spirit of Maharashtra.                </p>
                <p>Our mission is to bring the authentic essence of Maharashtrian food culture closer to people and introduce its timeless culinary treasures to a wider audience.</p>
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

    

      <section className="vm">
        <h2 className="section-title with-line">Vision & Mission</h2>
        <div className="vm__grid">
          <div className="vm__card">
            <h3 className="vm__title">Vision</h3>
            <p>
              To become a trusted destination for discovering and celebrating Maharashtra’s authentic culinary heritage, preserving traditional flavours, and sharing the richness of Maharashtrian food culture with future generations across India and beyond.
            </p>
          </div>
          <div className="vm__card">
            <h3 className="vm__title">Mission</h3>
            <ul className="vm__list">
              <li>Preserve Tradition: Celebrate and protect Maharashtra’s authentic recipes, food traditions, and culinary heritage.</li>
              <li>Promote Authentic Flavours: Showcase traditional sweets, snacks, spices, and regional specialities.</li>
              <li>Connect Generations: Keep the taste and memories of Maharashtrian cuisine alive for future generations.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── What Makes Olakh Maharashtrachi Different ── */}
      <section className="diff">
        <h2 className="section-title with-line">What Makes Olakh Maharashtrachi Different</h2>
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
