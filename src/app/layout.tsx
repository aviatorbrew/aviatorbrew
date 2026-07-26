import type { Metadata } from "next";
import "./globals.css";
import { AnalyticsHooks } from "@/components/analytics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aviatorbrew.com";
export const metadata: Metadata = { metadataBase: new URL(siteUrl), title: { default: "Aviator Brewing Company | Fuquay-Varina, NC", template: "%s | Aviator Brewing Company" }, description: "Craft beer, scratch-made food, live music, events, breakfast, cocktails, and aviation-inspired experiences in Fuquay-Varina, North Carolina.", openGraph: { type: "website", locale: "en_US", siteName: "Aviator Brewing Company" }, robots: { index: true, follow: true } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AnalyticsHooks /><div className="page-shell"><SiteHeader /><main id="main" className="page-main">{children}</main><SiteFooter /></div></body></html>; }
