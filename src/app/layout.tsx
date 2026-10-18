import type { Metadata } from "next";
import "./globals.css";
import "./site-enhancements.css";
import "./private-event-payment.css";
import "./private-event-packages.css";
import "./flight-crew.css";
import "./itinerary.css";
import "./payment-test.css";
import "./home-logo-viewer.css";
import "./home.css";
import "./become-a-pilot.css";
import "./site-header.css";
import "./contact.css";
import "./tour-email.css";
import "./tours.css";
import "./event-planning.css";
import "./manager.css";
import "./online-catering.css";
import packageInfo from "../../package.json";
import { AnalyticsHooks } from "@/components/analytics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { publicSiteUrl } from "@/lib/site-url";

const siteUrl = publicSiteUrl();
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Aviator Brewing Company | Fuquay-Varina, NC", template: "%s | Aviator Brewing Company" },
  description: "Craft beer, scratch-made food, live music, events, breakfast, cocktails, and aviation-inspired experiences in Fuquay-Varina, North Carolina.",
  openGraph: { type: "website", locale: "en_US", siteName: "Aviator Brewing Company" },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/api/branding/icon?size=32", type: "image/png", sizes: "32x32" },
      { url: "/api/branding/icon?size=64", type: "image/png", sizes: "64x64" },
    ],
    apple: { url: "/api/branding/icon?size=180", type: "image/png", sizes: "180x180" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const revision = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  const websiteVersion = revision ? `${packageInfo.version} · ${revision}` : packageInfo.version;
  return <html lang="en"><body><AnalyticsHooks /><div className="page-shell"><SiteHeader version={websiteVersion} /><main id="main" className="page-main">{children}</main><SiteFooter /></div></body></html>;
}
