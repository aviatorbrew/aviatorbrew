"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type StoredCartItem = {
  variantId: number;
  quantity: number;
  productName: string;
  variantLabel: string;
  imageUrl: string;
  unitPriceCents: number;
  maxQuantity: number;
};

type ShopCartContextValue = {
  items: StoredCartItem[];
  hydrated: boolean;
  count: number;
  notice: string;
  addItem: (item: StoredCartItem) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  removeItem: (variantId: number) => void;
  clearCart: () => void;
};

const storageKey = "aviator-shop-cart-v1";
const ShopCartContext = createContext<ShopCartContextValue | null>(null);

function validStoredItems(value: unknown): StoredCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<StoredCartItem>;
    const variantId = Number(item.variantId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(quantity) || quantity < 1) return [];
    return [{ variantId, quantity: Math.min(1000, quantity), productName: String(item.productName || "Aviator item"), variantLabel: String(item.variantLabel || "Default"), imageUrl: String(item.imageUrl || ""), unitPriceCents: Number(item.unitPriceCents || 0), maxQuantity: Math.max(1, Math.min(1000, Number(item.maxQuantity || 25))) }];
  });
}

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StoredCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    try { setItems(validStoredItems(JSON.parse(window.localStorage.getItem(storageKey) || "[]"))); }
    catch { setItems([]); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(items)); }
    catch { /* The cart still works for this page when browser storage is unavailable. */ }
  }, [hydrated, items]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const addItem = useCallback((item: StoredCartItem) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (!existing) return [...current, { ...item, quantity: Math.min(item.quantity, item.maxQuantity) }];
      return current.map((entry) => entry.variantId === item.variantId ? { ...entry, quantity: Math.min(entry.quantity + item.quantity, item.maxQuantity), maxQuantity: item.maxQuantity, unitPriceCents: item.unitPriceCents } : entry);
    });
    setNotice(item.productName);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4000);
  }, []);

  const updateQuantity = useCallback((variantId: number, quantity: number) => {
    setItems((current) => current.map((item) => item.variantId === variantId ? { ...item, quantity: Math.max(1, Math.min(item.maxQuantity, quantity || 1)) } : item));
  }, []);

  const removeItem = useCallback((variantId: number) => {
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setNotice("");
  }, []);

  const value = useMemo<ShopCartContextValue>(() => ({
    items,
    hydrated,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    notice,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  }), [items, hydrated, notice, addItem, updateQuantity, removeItem, clearCart]);

  return <ShopCartContext.Provider value={value}>{children}</ShopCartContext.Provider>;
}

export function useShopCart() {
  const context = useContext(ShopCartContext);
  if (!context) throw new Error("useShopCart must be used inside ShopCartProvider.");
  return context;
}

export function ShopCartBar() {
  const { count, notice } = useShopCart();
  return <><div className="shop-cart-bar"><div className="content-wrap"><span className="shop-cart-brand">AVIATOR SUPPLY</span><nav aria-label="Shop navigation"><Link href="/shop-new">Catalog</Link><Link className="shop-cart-primary" href="/shop-new/cart" aria-label={"View cart with " + count + " items"}><span>View cart</span><strong>{count}</strong></Link></nav></div></div>{notice ? <div className="shop-cart-toast" role="status" aria-live="polite"><div><b>Added to cart</b><span>{notice}</span></div><Link href="/shop-new/cart">Review cart ({count})</Link></div> : null}</>;
}
