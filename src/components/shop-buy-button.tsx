"use client";

import { useState } from "react";
import { useShopCart } from "@/components/shop-cart";
import type { ShopProduct } from "@/lib/shop";

function shopVariantAvailable(variant: ShopProduct["variants"][number]) { return variant.published && variant.availableForSale && (!variant.trackInventory || variant.availableInventoryCount > 0); }

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function optionLabel(value: string) { return value === "Default Title" || value === "Default" ? "Standard" : value; }

export function ShopBuyBox({ product }: { product: ShopProduct }) {
  const cutoff = product.ticketSalesEndAt || product.ticketEventStartsAt;
  const ticketSalesOpen = product.productType !== "ticket" || !cutoff || new Date(cutoff).getTime() > Date.now();
  const available = ticketSalesOpen && (product.productType !== "ticket" || product.ticketAvailableCount > 0) ? product.variants.filter(shopVariantAvailable) : [];
  const first = available[0];
  const [variantId, setVariantId] = useState(first?.id || 0);
  const selected = available.find((variant) => variant.id === variantId) || first;
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useShopCart();
  const purchaseLimit = product.productType === "ticket" ? Math.min(product.ticketMaxPerOrder, product.ticketAvailableCount) : 25;
  const max = selected ? (selected.trackInventory ? Math.min(purchaseLimit, selected.availableInventoryCount) : purchaseLimit) : 0;

  function add() {
    if (!selected) return;
    addItem({ variantId: selected.id, quantity, productName: product.name, variantLabel: optionLabel(selected.label), imageUrl: product.imageUrl, unitPriceCents: selected.priceCents, maxQuantity: max });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  if (!selected) return <p className="shop-new-unavailable">Sold out</p>;
  return <div className="shop-new-buy-box">
    <label>Option<select value={variantId} onChange={(event) => { const next = Number(event.currentTarget.value); setVariantId(next); const found = available.find((variant) => variant.id === next); setQuantity(Math.min(quantity, found ? (product.productType === "ticket" ? Math.min(product.ticketMaxPerOrder, product.ticketAvailableCount) : found.trackInventory ? found.availableInventoryCount : 25) : 1)); }}>{available.map((variant) => <option value={variant.id} key={variant.id}>{optionLabel(variant.label)} - {money(variant.priceCents)}</option>)}</select></label>
    <div className="shop-new-add-row"><label>{product.productType === "ticket" ? "Tickets" : "Quantity"}<input type="number" min="1" max={max} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(max, Number(event.currentTarget.value) || 1)))} /></label><button className="button" type="button" onClick={add}>{added ? "Added" : "Add to cart"}</button></div>
  </div>;
}
