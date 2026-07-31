"use client";

import { useState } from "react";
import { useShopCart } from "@/components/shop-cart";
import type { ShopProduct } from "@/lib/shop";

function shopVariantAvailable(variant: ShopProduct["variants"][number]) { return variant.published && variant.availableForSale && (!variant.trackInventory || variant.inventoryCount > 0); }

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function optionLabel(value: string) { return value === "Default Title" || value === "Default" ? "Standard" : value; }

export function ShopBuyBox({ product }: { product: ShopProduct }) {
  const available = product.variants.filter(shopVariantAvailable);
  const first = available[0];
  const [variantId, setVariantId] = useState(first?.id || 0);
  const selected = available.find((variant) => variant.id === variantId) || first;
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useShopCart();
  const max = selected ? (selected.trackInventory ? Math.min(25, selected.inventoryCount) : 25) : 0;

  function add() {
    if (!selected) return;
    addItem({ variantId: selected.id, quantity, productName: product.name, variantLabel: optionLabel(selected.label), imageUrl: product.imageUrl, unitPriceCents: selected.priceCents, maxQuantity: max });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  if (!selected) return <p className="shop-new-unavailable">Sold out</p>;
  return <div className="shop-new-buy-box">
    <label>Option<select value={variantId} onChange={(event) => { const next = Number(event.currentTarget.value); setVariantId(next); const found = available.find((variant) => variant.id === next); setQuantity(Math.min(quantity, found ? (found.trackInventory ? found.inventoryCount : 25) : 1)); }}>{available.map((variant) => <option value={variant.id} key={variant.id}>{optionLabel(variant.label)} - {money(variant.priceCents)}</option>)}</select></label>
    <div className="shop-new-add-row"><label>Quantity<input type="number" min="1" max={max} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(max, Number(event.currentTarget.value) || 1)))} /></label><button className="button" type="button" onClick={add}>{added ? "Added" : "Add to cart"}</button></div>
  </div>;
}
