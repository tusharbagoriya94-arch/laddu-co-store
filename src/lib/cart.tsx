import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { MAX_QTY, priceCart, sanitizeCart, type Cart, type ProductId } from "./store";

const KEY = "ladduco-cart-v1";

type CartCtx = {
  cart: Cart;
  ready: boolean;
  count: number;
  setQty: (id: ProductId, qty: number) => void;
  add: (id: ProductId) => void;
  clear: () => void;
  priced: ReturnType<typeof priceCart>;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setCart(sanitizeCart(JSON.parse(raw)));
    } catch {
      // storage unavailable: start with an empty cart
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, ready]);

  const setQty = useCallback((id: ProductId, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      const q = Math.max(0, Math.min(MAX_QTY, Math.round(qty)));
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });
  }, []);

  const add = useCallback((id: ProductId) => {
    setCart((c) => ({ ...c, [id]: Math.min(MAX_QTY, (c[id] ?? 0) + 1) }));
  }, []);

  const clear = useCallback(() => setCart({}), []);

  const value = useMemo(() => {
    const priced = priceCart(cart);
    const count = priced.lines.reduce((s, l) => s + l.qty, 0);
    return { cart, ready, count, setQty, add, clear, priced };
  }, [cart, ready, setQty, add, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}
