import { ShopCartBar, ShopCartProvider } from "@/components/shop-cart";

export default function ShopNewLayout({ children }: { children: React.ReactNode }) {
  return <ShopCartProvider><ShopCartBar />{children}</ShopCartProvider>;
}
