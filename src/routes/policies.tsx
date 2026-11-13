import { createFileRoute } from "@tanstack/react-router";

import { Page } from "../components/shell";
import { BUSINESS, DELIVERY_FEE, FREE_DELIVERY_FROM, INDEPENDENT_LINE, RAJASTHAN_ONLY, RECIPE_NOTE, rs } from "../lib/store";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Policies | LADDU.CO" },
      { name: "description", content: "LADDU.CO shipping, refund and cancellation, privacy, terms and contact details." },
    ],
    links: [{ rel: "canonical", href: "/policies" }],
  }),
  component: Policies,
});

function Policies() {
  return (
    <Page>
      <section className="checkout-page">
        <div className="wrap narrow policy">
          <h1 className="checkout-title">Policies</h1>
          <p className="muted">Last updated: 6 November 2026. LADDU.CO is a brand of {BUSINESS.legalName}.</p>
          <nav className="policy-nav" aria-label="Policies">
            <a href="#shipping">Shipping</a>
            <a href="#refund">Refund and cancellation</a>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#contact">Contact us</a>
            <a href="#grievance">Grievance officer</a>
          </nav>

          <h2 id="shipping">Shipping policy</h2>
          <ul>
            <li>
              {RAJASTHAN_ONLY
                ? "We currently deliver to addresses in Rajasthan only. Delivery to the rest of India is starting soon."
                : "We deliver across India through Delhivery, India Post Speed Post and local delivery partners."}
            </li>
            <li>Orders are freshly packed and dispatched within 1 to 2 working days of payment.</li>
            <li>Delivery usually takes 2 to 5 working days after dispatch, depending on the PIN code.</li>
            <li>Delivery charge is {rs(DELIVERY_FEE)} per order. Delivery is free when the products total is {rs(FREE_DELIVERY_FROM)} or more. The charge is shown before payment.</li>
            <li>The tracking number is emailed to you when the parcel is dispatched.</li>
            <li>Please give a correct address and an active mobile number. Parcels returned because of a wrong address or a refused delivery cannot be refunded, as food cannot be resold.</li>
          </ul>

          <h2 id="refund">Refund and cancellation policy</h2>
          <ul>
            <li>Our products are food items, so they cannot be returned once delivered.</li>
            <li>Damaged, missing or wrong items: reply to your order email with a photo or unboxing video within 24 hours of delivery. We will send a free replacement or give a full refund for those items, as you prefer.</li>
            <li>Cancellation: you can cancel for a full refund any time before the order is dispatched, by replying to your order confirmation email.</li>
            <li>Approved refunds are sent to the original payment method within 5 to 7 working days.</li>
          </ul>

          <h2 id="privacy">Privacy policy</h2>
          <ul>
            <li>We collect your name, mobile number, email and delivery address only to process and deliver your order and to contact you about it.</li>
            <li>Payments are processed by Cashfree Payments, an RBI-authorised payment aggregator. We never see or store your card, UPI or bank details.</li>
            <li>We share your name, phone and address only with the courier delivering your parcel. We do not sell your data.</li>
            <li>To have your data deleted, email us at the address below.</li>
          </ul>

          <h2 id="terms">Terms and conditions</h2>
          <ul>
            <li>Prices are in Indian Rupees and include all applicable taxes. The total, including delivery, is shown before you pay.</li>
            <li>An order is confirmed only after successful payment. If an item becomes unavailable, we will refund it in full.</li>
            <li>Product size and shape can vary slightly from piece to piece. Every pack carries the batch number, manufacturing and best-before dates, ingredients, allergens and nutrition information.</li>
            <li>{INDEPENDENT_LINE}</li>
            <li>{RECIPE_NOTE}</li>
            <li>These terms are governed by the laws of India. Courts at Chittorgarh, Rajasthan have jurisdiction.</li>
          </ul>

          <h2 id="contact">Contact us</h2>
          <p>
            <b>{BUSINESS.legalName}</b> (brand: LADDU.CO)<br />
            {BUSINESS.address}<br />
            Email: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
            <br />Phone / WhatsApp: <a href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`}>{BUSINESS.phone}</a>
            <br />FSSAI Reg. No. {BUSINESS.fssai}
            <br />Country of origin of products: {BUSINESS.countryOfOrigin}
          </p>

          <h2 id="grievance">Grievance officer</h2>
          <p>
            As required by the Consumer Protection (E-Commerce) Rules, 2020:<br />
            <b>{BUSINESS.grievanceOfficer.name}</b>, {BUSINESS.grievanceOfficer.designation}, {BUSINESS.legalName}<br />
            Phone: {BUSINESS.phone} · Email: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a><br />
            We acknowledge every complaint within 48 hours and resolve it within one month of receipt.
          </p>
        </div>
      </section>
    </Page>
  );
}
