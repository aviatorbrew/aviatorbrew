export const menuLocations = [
  { slug: "hangar-bar", name: "Aviator Hangar Bar" },
  { slug: "taphouse", name: "Aviator TapHouse" },
  { slug: "pizza-pub", name: "Aviator Pizza Pub" },
  { slug: "harddeck", name: "Aviator HardDeck Restaurant" },
  { slug: "c-54-airplane-bar", name: "Aviator C-54 Airplane Bar" },
  { slug: "ready-room", name: "Ready Room Liquor Lounge" },
  { slug: "speakeasy", name: "Aviator Speakeasy Liquor Lounge" },
  { slug: "catering-events", name: "Catering + Events" },
] as const;

export type MenuLocationSlug = (typeof menuLocations)[number]["slug"];

export function isMenuLocation(value: string): value is MenuLocationSlug {
  return menuLocations.some((location) => location.slug === value);
}
