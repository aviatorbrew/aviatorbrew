import type { Metadata } from "next";
import { ShopCartCheckout } from "@/components/shop-cart-checkout";

export const metadata: Metadata = { title: "Cart | Aviator Supply", description: "Review your Aviator cart, calculate USPS shipping, and check out securely." };
export const dynamic = "force-dynamic";

export default async function ShopCartPage({ searchParams }: { searchParams?: Promise<{ checkout?: string }> }) {
  const params = await (searchParams || Promise.resolve({ checkout: undefined }));
  return <ShopCartCheckout checkoutStatus={params.checkout} />;
}
