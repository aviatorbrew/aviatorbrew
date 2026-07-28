export const managerSections = [
  {
    id: "overview",
    href: "/manager",
    label: "Overview",
    description: "Open a manager section from the dashboard.",
  },
  {
    id: "newsletter",
    href: "/manager/newsletter",
    label: "Flight Crew",
    description: "Manage members, customize the welcome email, and send campaigns.",
  },
  {
    id: "tours",
    href: "/manager/tours",
    label: "Tours",
    description: "Set tour rules and manage upcoming guests.",
  },
  {
    id: "payments",
    href: "/manager/payments",
    label: "Payments",
    description: "Run and verify a $1 live Stripe Checkout test.",
  },
  {
    id: "locations",
    href: "/manager/locations",
    label: "Locations",
    description: "Update public location details and schedules.",
  },
  {
    id: "coupons",
    href: "/manager/coupons",
    label: "Coupons",
    description: "Create, validate, and manage customer offers.",
  },
  {
    id: "beers",
    href: "/manager/beers",
    label: "Beers",
    description: "Edit the public beer list and product artwork.",
  },
  {
    id: "brewery-photos",
    href: "/manager/brewery-photos",
    label: "Brewery Photos",
    description: "Upload brewery photography and choose the featured brewery image.",
  },
  {
    id: "amphitheater-photos",
    href: "/manager/amphitheater-photos",
    label: "Amphitheater Photos",
    description: "Upload Aviator Amphitheater photography and choose the featured venue image.",
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
    label: "Kegs",
    description: "Publish the current BrewOps keg inventory.",
  },
  {
    id: "events",
    href: "/manager/events",
    label: "Events",
    description: "Publish and manage special events.",
  },
  {
    id: "media",
    href: "/manager/media",
    label: "Menus & Photos",
    description: "Upload the Aviator logo, menus, and website photography.",
  },
] as const;

export type ManagerSection = (typeof managerSections)[number]["id"];

export function isManagerSection(value: string): value is ManagerSection {
  return managerSections.some((section) => section.id === value);
}
