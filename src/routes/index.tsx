import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { Page, ProductArt, QtyStepper } from "../components/shell";
import { useCart } from "../lib/cart";
import { BUSINESS, DELIVERY_FEE, FREE_DELIVERY_FROM, PRODUCTS, RAJASTHAN_ONLY, rs } from "../lib/store";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: "/" }] }),
  component: Home,
});

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ValueIcon({ kind }: { kind: "ghee" | "shield" | "fresh" | "label" }) {
  const paths: Record<typeof kind, ReactElement> = {
    ghee: (
      <>
        <path d="M10 9h12M11 9c-3 3-4 6-4 10a9 9 0 0018 0c0-4-1-7-4-10M12 5h8v4h-8z" />
        <path d="M12 20c0 2 2 4 4 4" strokeLinecap="round" />
      </>
    ),
    shield: (
      <>
        <path d="M16 4l10 4v7c0 6.5-4.3 11.2-10 13-5.7-1.8-10-6.5-10-13V8z" />
        <path d="M11.5 16l3.2 3.2 6-6.4" strokeLinecap="round" />
      </>
    ),
    fresh: <path d="M6 16h20M8 16v6a4 4 0 004 4h8a4 4 0 004-4v-6M12 11c0-2 2-2 2-4M17 11c0-2 2-2 2-4" strokeLinecap="round" />,
    label: (
      <>
        <rect x="6" y="5" width="20" height="23" rx="2" />
        <path d="M11 11h10M11 16h10M11 21h6" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

function ProductCard({ id }: { id: (typeof PRODUCTS)[number]["id"] }) {
  const p = PRODUCTS.find((x) => x.id === id)!;
  const { cart, setQty, add, ready } = useCart();
  const qty = cart[p.id] ?? 0;
  return (
    <article className="product">
      <ProductArt id={p.id} />
      <div className="body">
        <h3>{p.name}</h3>
        <p className="desc">{p.desc}</p>
        <ul className="specs">
          {p.specs.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <div className="buy">
          <span className="price">
            {rs(p.price)}
            <small>{p.pack} · MRP (incl. of all taxes)</small>
          </span>
          {ready && qty > 0 ? (
            <QtyStepper value={qty} onChange={(v) => setQty(p.id, v)} label={p.name} />
          ) : (
            <button type="button" className="add-btn" onClick={() => add(p.id)}>
              Cart mein daalein
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Home() {
  const { count, ready } = useCart();
  return (
    <Page>
      <section className="hero">
        <div className="wrap">
          <div>
            <p className="eyebrow since">Recipe since 1961<sup>*</sup></p>
            <h1>Seth ji ke laddu aur mathri</h1>
            <p className="lede">Sanwariya Ji ki sabse famous mithai, saalon se logon ka bharosa. Ab seedha aapke ghar tak.</p>
            <div className="actions">
              <a className="btn-solid" href="#products">Abhi order karein</a>
              {ready && count > 0 ? (
                <Link className="btn-line" to="/checkout">Cart dekhein ({count})</Link>
              ) : (
                <a className="btn-line" href="#kahani">Hamari kahani</a>
              )}
            </div>
            <div className="points">
              <span><Check />Seedha ghar tak delivery</span>
              <span><Check />{rs(FREE_DELIVERY_FROM)} se upar free delivery</span>
              <span><Check />UPI, card se surakshit payment</span>
            </div>
          </div>
          <div className="hero-art" role="img" aria-label="LADDU.CO laddu aur mathri">
            <img className="m" src="/assets/mathri-front.webp" alt="" />
            <img className="l" src="/assets/laddu-front.webp" alt="" />
          </div>
        </div>
      </section>

      <section className="section" id="products">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Hamare products</p>
            <h2>Do cheezein, ek hi recipe</h2>
            <p>
              Pack chuniye, cart mein daaliye aur online pay kariye. Delivery charge {rs(DELIVERY_FEE)}; {rs(FREE_DELIVERY_FROM)} ya usse zyada ke order par delivery free.
              {RAJASTHAN_ONLY ? " Abhi delivery Rajasthan mein ho rahi hai." : ""}
            </p>
          </div>
          <div className="products">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} id={p.id} />
            ))}
          </div>
          <p className="product-decl">
            Marketed by: {BUSINESS.legalName}, {BUSINESS.address} · FSSAI Reg. No. {BUSINESS.fssai} · Country of origin: {BUSINESS.countryOfOrigin} · Customer care: <a href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`}>{BUSINESS.phone}</a>, <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
          </p>
          <div className="products-cta">
            <Link to="/checkout" className="btn-solid">Checkout par jaayein</Link>
          </div>
        </div>
      </section>

      <section className="section story" id="kahani">
        <div className="wrap">
          <div className="story-logo">
            <img src="/assets/logo-lg.webp" alt="LADDU.CO logo, recipe since 1961" loading="lazy" />
          </div>
          <div>
            <p className="eyebrow">Hamari kahani</p>
            <h2>Seth ji ki kripa se, 1961 se</h2>
            <p>Sanwariya Ji se laut kar har bhakt ke haath mein laddu aur mathri hote hain. Yeh sirf mithai nahi, Seth ji par atoot vishwas ki mithaas hai, jo ghar-ghar mein baanti jaati hai.</p>
            <p>Lakhon log Seth ji ko apna saathi maan kar har kaam shuru karte hain. Usi vishwas ke saath, 1961 se yeh recipe chali aa rahi hai, aur ab seedha aapke ghar tak.</p>
            <blockquote>Jo kuch hai, sab Seth ji ki kripa hai. 🙏</blockquote>
          </div>
        </div>
      </section>

      <section className="section" id="vishwas">
        <div className="wrap">
          <div className="section-head">
            <h2>Swaad ke saath bharosa</h2>
          </div>
          <div className="values">
            <div className="value"><ValueIcon kind="ghee" /><h3>Shuddh desi ghee</h3><p>Har laddu aur mathri sirf desi ghee mein.</p></div>
            <div className="value"><ValueIcon kind="shield" /><h3>Hygienic unit</h3><p>Saaf-suthre professional unit mein, hygiene ke poore niyam ke saath.</p></div>
            <div className="value"><ValueIcon kind="fresh" /><h3>Har batch ka record</h3><p>Har batch ka apna number aur date, taaki har pack ki poori pehchaan rahe.</p></div>
            <div className="value"><ValueIcon kind="label" /><h3>Poori jaankari</h3><p>Batch no., MFG aur best-before date, ingredients, nutrition values aur FSSAI number, sab pack par.</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="kaise">
        <div className="wrap how">
          <div>
            <p className="eyebrow">Order kaise karein</p>
            <h2>Teen aasaan steps</h2>
          </div>
          <ol className="steps">
            <li><div><h3>Pack chuniye</h3><p>Laddu, mathri ya combo cart mein daaliye.</p></div></li>
            <li><div><h3>Pata bhariye aur pay kariye</h3><p>UPI, card ya netbanking se surakshit online payment.</p></div></li>
            <li><div><h3>Order confirm</h3><p>Turant "order placed" ka message aur email. Dispatch hote hi tracking number email par.</p></div></li>
          </ol>
        </div>
      </section>
    </Page>
  );
}
