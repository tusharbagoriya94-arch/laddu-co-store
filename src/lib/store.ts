// Shared store config (used by both the browser and the server).
// Prices are in rupees. The server recalculates every order from this file,
// so a customer can never change a price from the browser.

export type ProductId = "laddu" | "mathri" | "combo";

export type Product = {
  id: ProductId;
  name: string;
  pack: string;
  price: number;
  desc: string;
  specs: [string, string][];
};

// Prices in rupees (MRP, incl. of all taxes). Set by Tushar, 6 Nov 2026.
export const PRODUCTS: Product[] = [
  {
    id: "laddu",
    name: "Laddu",
    pack: "1 laddu",
    price: 149,
    desc: "Dheemi aanch par bhuna, desi ghee mein bandha, upar se chamakti shakkar.",
    specs: [
      ["Size", "Lagbhag 5.5 cm"],
      ["Ghee", "Shuddh desi ghee"],
      ["Net quantity", "1 piece"],
      ["Label", "Batch no. + nutrition"],
    ],
  },
  {
    id: "mathri",
    name: "Mathri",
    pack: "1 mathri",
    price: 139,
    desc: "Badi, mothi aur khasta. Elaichi wali meethi mathri, desi ghee mein tali.",
    specs: [
      ["Size", "Lagbhag 14 cm"],
      ["Swaad", "Meetha, elaichi wala"],
      ["Net quantity", "1 piece"],
      ["Label", "Batch no. + nutrition"],
    ],
  },
  {
    id: "combo",
    name: "Combo",
    pack: "1 laddu + 1 mathri",
    price: 259,
    desc: "Laddu aur mathri ek saath, alag-alag lene se ₹29 kam mein.",
    specs: [
      ["Laddu", "1 piece"],
      ["Mathri", "1 piece"],
      ["Net quantity", "2 pieces"],
    ],
  },
];

// Delivery charge per order, in rupees. Free when the products total reaches FREE_DELIVERY_FROM.
export const DELIVERY_FEE = 40;
export const FREE_DELIVERY_FROM = 500;

// true until GST registration is done: only Rajasthan PIN codes can order.
// Set to false to open delivery to all of India.
export const RAJASTHAN_ONLY = true;

export const MAX_QTY = 20;

export const BUSINESS = {
  brand: "LADDU.CO",
  legalName: "Sanwariya Sweets",
  address: "Near Meera Circle, Mandphiya (Sanwaliya Ji), Bhadesar, Chittorgarh, Rajasthan 312027",
  shortAddress: "Sanwariya Ji, Chittorgarh, Rajasthan",
  email: "tusharbagoriya94@gmail.com",
  phone: "+91 80005 01112",
  fssai: "22226028000792",
  countryOfOrigin: "India",
  grievanceOfficer: { name: "Tushar Bagoriya", designation: "Proprietor" },
  instagram: "laddu_co",
};

export const INDEPENDENT_LINE =
  "LADDU.CO is an independent brand, not linked to Shri Sanwaliyaji Mandir Mandal.";

export const RECIPE_NOTE =
  '*"Recipe since 1961" hamari recipe ki umar batata hai, LADDU.CO brand ki nahi. LADDU.CO brand 2026 mein shuru hua hai; 1961 se sirf yeh recipe chali aa rahi hai. ("Recipe since 1961" refers to the age of the recipe, not of the LADDU.CO brand, which was launched in 2026.)';

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export type Cart = Partial<Record<ProductId, number>>;

export type PricedLine = {
  id: ProductId;
  name: string;
  pack: string;
  qty: number;
  price: number;
  sub: number;
};

export function sanitizeCart(input: unknown): Cart {
  const out: Cart = {};
  if (!input || typeof input !== "object") return out;
  for (const p of PRODUCTS) {
    const v = (input as Record<string, unknown>)[p.id];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) {
      out[p.id] = Math.min(v, MAX_QTY);
    }
  }
  return out;
}

export function priceCart(cart: Cart) {
  const lines: PricedLine[] = [];
  let itemsTotal = 0;
  for (const p of PRODUCTS) {
    const qty = cart[p.id] ?? 0;
    if (qty <= 0) continue;
    const sub = qty * p.price;
    itemsTotal += sub;
    lines.push({ id: p.id, name: p.name, pack: p.pack, qty, price: p.price, sub });
  }
  const delivery = itemsTotal > 0 && itemsTotal < FREE_DELIVERY_FROM ? DELIVERY_FEE : 0;
  return { lines, itemsTotal, delivery, total: itemsTotal + delivery };
}

export function isRajasthanPin(pin: string) {
  return /^3[0-4]\d{4}$/.test(pin);
}

export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export function deliveryLabel(n: number) {
  return n === 0 ? "Free" : rs(n);
}

export function rs(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Payment pending",
  paid: "Paid, to pack",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Payment failed",
};
