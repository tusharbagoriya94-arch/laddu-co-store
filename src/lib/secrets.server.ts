import process from "node:process";

import { bindings } from "./bindings.server";

// Secrets are set in Cloudflare (Worker → Settings → Variables and secrets) and arrive on the Worker
// env at request time. Always read them inside a handler, never at module scope.
export type SecretName =
  | "RAZORPAY_KEY_ID"
  | "RAZORPAY_KEY_SECRET"
  | "RAZORPAY_WEBHOOK_SECRET"
  | "BREVO_API_KEY"
  | "MAIL_FROM"
  | "OWNER_EMAIL"
  | "ADMIN_PASSWORD";

export function secret(name: SecretName): string {
  const fromEnv = (bindings() as unknown as Record<string, unknown>)[name];
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  return "";
}

export function ownerEmail() {
  return secret("OWNER_EMAIL") || "tusharbagoriya94@gmail.com";
}

export function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
