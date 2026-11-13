export const managerSections = [
  {
    id: "overview",
    href: "/manager",
    label: "Overview",
    description: "Open a manager section from the dashboard.",
  },
  {
    id: "beers",
    href: "/manager/beers",
    label: "Beers",
    description: "Manage the beer master list, publishing, and product artwork.",
  },
  {
    id: "shop",
    href: "/manager/shop",
    label: "Shop",
    description: "Manage Aviator Supply catalogs, products, variants, prices, and inventory.",
  },
  {
    id: "shop-sales",
    href: "/manager/shop-sales",
    label: "Shop Sales",
    description: "Monthly shop sales, items sold, payment totals and tax filing worksheets.",
  },
  {
    id: "beer-release-alert",
    href: "/manager/beer-release-alert",
    label: "New Release Alerts",
    description: "Update bold homepage release alerts and sell sheets.",
  },
  {
    id: "beverages",
    href: "/manager/beverages",
    label: "Beverages",
    description: "Manage soda, THC soda, and seltzer products.",
  },
  {
    id: "kegs",
    href: "/manager/kegs",
    label: "Beverage Sales",
    description: "Import current keg, case, and package availability with pricing.",
  },
  {
    id: "brewery-photos",
    href: "/manager/brewery-photos",
    label: "Brewery Photos",
    description: "Upload brewery photography and choose the featured brewery image.",
  },
  {
    id: "locations",
    href: "/manager/locations",
    label: "Locations",
    description: "Update public location details and schedules.",
  },
  {
    id: "media",
    href: "/manager/media",
    label: "Menus & Photos",
    description: "Upload the Aviator logo, menus, and website photography.",
  },
  {
    id: "private-event-photos",
    href: "/manager/private-event-photos",
    label: "Private Event Photos",
    description: "Upload Ready Room private event photography and choose the featured event room image.",
  },
  {
    id: "amphitheater-photos",
    href: "/manager/amphitheater-photos",
    label: "Amphitheater Photos",
    description: "Upload Aviator Amphitheater photography and choose the featured venue image.",
  },
  {
    id: "events",
    href: "/manager/events",
    label: "Events",
    description: "Publish and manage special events.",
  },
  {
    id: "private-events",
    href: "/manager/private-events",
    label: "Private Events",
    description: "Plan private events, manage the calendar and orders, print summaries, and send guest updates.",
  },
  {
    id: "feast",
    href: "/manager/feast",
    label: "Feast Event",
    description: "Manage holiday feast orders, the pickup calendar, kitchen sheets and checkout receipts.",
  },
  {
    id: "catering",
    href: "/manager/catering",
    label: "Catering",
    description: "Review Catering To Go orders and export customer follow-up lists.",
  },
  {
    id: "tours",
    href: "/manager/tours",
    label: "Tours",
    description: "Set tour rules and manage upcoming guests.",
  },
  {
    id: "coupons",
    href: "/manager/coupons",
    label: "Coupons",
    description: "Create, validate, and manage customer offers.",
  },
  {
    id: "site-skins",
    href: "/manager/site-skins",
    label: "Website Skins",
    description: "Switch seasonal website themes, feature a show, and restore the standard Aviator design.",
  },
  {
    id: "skin-comments", href: "/manager/skin-comments", label: "Image Comments", description: "Review artwork comments, automatic removals and publication history.",
  },
  {
    id: "newsletter",
    href: "/manager/newsletter",
    label: "Newsletter",
    description: "Manage members, customize the welcome email, and send campaigns.",
  },
  {
    id: "payments",
    href: "/manager/payments",
    label: "Payments",
    description: "Run and verify a $1 live Stripe Checkout test.",
  },
  {
    id: "email-test",
    href: "/manager/email-test",
    label: "Message Tests",
    description: "Send diagnostics email and Twilio SMS messages.",
  },
  {
    id: "database",
    href: "/manager/database",
    label: "Database",
    description: "Check Postgres health, list tables, and browse table rows.",
  },
] as const;

export type ManagerSection = (typeof managerSections)[number]["id"];

export const managerSectionGroups = [
  { id: "dashboard", label: "Dashboard", sections: ["overview"] },
  { id: "products", label: "Products & Sales", sections: ["beers", "beverages", "beer-release-alert", "kegs", "shop", "shop-sales"] },
  { id: "media", label: "Photos, Menus & Locations", sections: ["media", "brewery-photos", "private-event-photos", "amphitheater-photos", "locations"] },
  { id: "hospitality", label: "Events & Hospitality", sections: ["events", "private-events", "feast", "catering", "tours"] },
  { id: "marketing", label: "Marketing", sections: ["site-skins", "skin-comments", "newsletter", "coupons"] },
  { id: "system", label: "System Tools", sections: ["payments", "email-test", "database"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; sections: readonly ManagerSection[] }>;

export function isManagerSection(value: string): value is ManagerSection {
  return managerSections.some((section) => section.id === value);
}
