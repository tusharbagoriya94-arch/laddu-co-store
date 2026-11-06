import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useCart } from "../lib/cart";
import { BUSINESS, INDEPENDENT_LINE, RECIPE_NOTE, rs } from "../lib/store";

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={light ? "wordmark wordmark-light" : "wordmark"}>
      LADDU<b aria-hidden="true" />CO
    </span>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 8h12l-1 12H7L6 8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 016 0V8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Header() {
  const { count, ready } = useCart();
  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link to="/" className="brand" aria-label="LADDU.CO home">
          <img src="/assets/logo.webp" alt="" width={44} height={44} />
          <Wordmark />
        </Link>
        <nav aria-label="Main">
          <ul>
            <li><a href="/#products">Products</a></li>
            <li><a href="/#kahani">Hamari kahani</a></li>
            <li><a href="/#kaise">Order kaise karein</a></li>
          </ul>
        </nav>
        <Link to="/checkout" className="cart-pill" aria-label={`Cart, ${count} items`}>
          <BagIcon />
          <span>Cart</span>
          {ready && count > 0 ? <span className="cart-count">{count}</span> : null}
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot">
          <div>
            <Wordmark light />
            <p>Seth ji ke laddu aur mathri. Hygienic unit mein bane. Recipe since 1961.</p>
          </div>
          <div>
            <h4>Pata</h4>
            <ul>
              <li>{BUSINESS.legalName}</li>
              <li>{BUSINESS.shortAddress}</li>
            </ul>
            <h4 className="foot-h4-gap">Sampark</h4>
            <ul>
              <li><a href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`}>{BUSINESS.phone}</a></li>
              <li><a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a></li>
              <li><a href={`https://instagram.com/${BUSINESS.instagram}`} target="_blank" rel="noopener noreferrer">Instagram: @{BUSINESS.instagram}</a></li>
            </ul>
          </div>
          <div>
            <h4>Jaankari</h4>
            <ul>
              <li><Link to="/policies" hash="shipping">Shipping policy</Link></li>
              <li><Link to="/policies" hash="refund">Refund aur cancellation</Link></li>
              <li><Link to="/policies" hash="privacy">Privacy policy</Link></li>
              <li><Link to="/policies" hash="terms">Terms</Link></li>
              <li><Link to="/policies" hash="contact">Contact us</Link></li>
              <li><Link to="/policies" hash="grievance">Grievance officer</Link></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>{INDEPENDENT_LINE}</span>
          <span>FSSAI Reg. No. {BUSINESS.fssai} · © 2026 LADDU.CO</span>
          <span className="fine">{RECIPE_NOTE}</span>
        </div>
      </div>
    </footer>
  );
}

export function MobileCartBar() {
  const { count, ready, priced } = useCart();
  if (!ready || count === 0) return null;
  return (
    <div className="mobile-cart-bar">
      <span>
        {count} item{count > 1 ? "s" : ""} · <b>{rs(priced.total)}</b>
      </span>
      <Link to="/checkout" className="mobile-cart-go">Checkout</Link>
    </div>
  );
}

export function Page({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  return (
    <>
      <Header />
      <main id="top">{children}</main>
      <Footer />
      {cartBar ? <MobileCartBar /> : null}
    </>
  );
}

export function QtyStepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={`${label} quantity`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`${label} kam karein`}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`${label} badhaiye`}>
        +
      </button>
    </div>
  );
}

export function ProductArt({ id }: { id: string }) {
  if (id === "combo") {
    return (
      <div className="media combo" role="img" aria-label="Laddu aur mathri">
        <img className="m" src="/assets/mathri-front.webp" alt="" loading="lazy" />
        <img className="l" src="/assets/laddu-front.webp" alt="" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`media ${id}`} role="img" aria-label={id === "laddu" ? "Laddu" : "Mathri"}>
      <img src={`/assets/${id}-front.webp`} alt="" loading="lazy" />
    </div>
  );
}
