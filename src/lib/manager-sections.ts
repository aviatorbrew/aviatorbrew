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
    id: "beer-release-alert",
    href: "/manager/beer-release-alert",
    label: "New Release Alerts",
    description: "Update bold homepage release alerts and sell sheets.",
  },
  {
    id: "flight-log",
    href: "/manager/flight-log",
    label: "Flight Log",
    description: "Manage Flight Log posts, users, roles, bans, and moderation.",
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
    description: "Review archived private event inquiries and export marketing lists.",
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
    id: "newsletter",
    href: "/manager/newsletter",
    label: "Flight Crew",
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

export function isManagerSection(value: string): value is ManagerSection {
  return managerSections.some((section) => section.id === value);
}
