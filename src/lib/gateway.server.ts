import { cashfreeReady } from "./cashfree.server";
import { razorpayReady } from "./razorpay.server";
import { secret } from "./secrets.server";

// Cashfree is used whenever its keys are set. Set the secret PAYMENT_GATEWAY to "razorpay"
// to switch back without removing the Cashfree keys.
export function activeGateway(): "cashfree" | "razorpay" | null {
  const forced = secret("PAYMENT_GATEWAY").toLowerCase();
  if (forced === "razorpay") return razorpayReady() ? "razorpay" : null;
  if (cashfreeReady()) return "cashfree";
  if (razorpayReady()) return "razorpay";
  return null;
}
