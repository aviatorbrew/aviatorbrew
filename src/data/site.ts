export type Location = {
  slug: string; name: string; shortName: string; type: string; description: string;
  address: string; phone: string; hours: string; menu?: string; events?: boolean; comingSoon?: boolean;
  image: string; accessibility: string; parking: string;
};

export type Beer = {
  slug: string; name: string; style: string; abv: string; category: string;
  description: string; status: "Year-round" | "Seasonal" | "Limited"; image: string;
};

export type BeyondBeer = {
  slug: string; name: string; category: "Soda" | "THC Soda" | "Seltzer";
  description: string; note: string; image: string;
};

export type MusicVenue = {
  name: string; setting: string; description: string; location: string;
};

export type Event = {
  slug: string; title: string; date: string; time: string; venue: string;
  description: string; image: string; cta: string;
};

export const orderFoodUrl = "/order-food";

export const primaryNav = [
  { label: "Beer", href: "/beer", children: [{ label: "Brewery", href: "/brewery" }] },
  { label: "Locations", href: "/locations" },
  { label: "Events", href: "/events" },
  { label: "Private Events", href: "/private-events" },
  { label: "About & Tours", href: "/about" },
];

export const locations: Location[] = [
  { slug: "hangar-bar", name: "Aviator Hangar Bar", shortName: "Hangar Bar", type: "Flagship brewery campus", description: "Fresh Aviator beer, scratch-made food, live music, and a front-row seat to the energy of the brewery campus.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Sun–Tue 11am–10pm · Wed–Thu 11am–12am · Fri–Sat 11am–1am", menu: "/locations#menus", events: true, image: "/images/locations/hangar-bar.png", accessibility: "Step-free entry and accessible restrooms.", parking: "On-site parking with accessible spaces." },
  { slug: "aviator-amphitheater", name: "Aviator Amphitheater", shortName: "Aviator Amphitheater", type: "Outdoor concert venue", description: "Big-stage energy for concerts, festivals, and brewery campus nights under the open sky.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Event schedule varies", events: true, image: "/images/website-photos/90-brewery-campus.jpg", accessibility: "Accessible event routes and seating are available.", parking: "On-site brewery campus parking is available." },
  { slug: "taphouse", name: "Aviator TapHouse", shortName: "TapHouse", type: "The original Aviator", description: "Brewery-fresh beer and gastropub favorites in the historic Varina train depot.", address: "600 E. Broad St., Fuquay-Varina, NC 27526", phone: "919-552-8826", hours: "Mon–Thu 11:30am–11pm · Fri–Sat 11:30am–1am · Sun 11:30am–10pm", menu: "/locations#menus", image: "/images/locations/taphouse.png", accessibility: "Accessible entry and seating available.", parking: "Street and nearby public parking." },
  { slug: "pizza-pub", name: "Aviator Pizza Pub", shortName: "Pizza Pub", type: "Pizza + BeerShop", description: "Brick-oven pizza, Aviator beer, a rooftop vibe, and beer to take home.", address: "601 E. Broad St., Fuquay-Varina, NC 27526", phone: "919-346-8206", hours: "Mon–Thu 11:30am–11pm · Fri–Sat 11:30am–12am · Sun 11:30am–10pm", menu: "/locations#menus", image: "/images/locations/pizza-pub.png", accessibility: "Accessible entry and main-level seating.", parking: "Street and nearby public parking." },
  { slug: "harddeck", name: "Aviator HardDeck Restaurant", shortName: "HardDeck", type: "Future steakhouse restaurant", description: "A future campus restaurant planned around hand-cut steaks, warm hospitality, and Aviator’s unmistakable energy.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Coming soon", comingSoon: true, image: "/images/locations/harddeck.png", accessibility: "Accessibility details will be published before opening.", parking: "Campus parking details will be published before opening." },
  { slug: "c-54-airplane-bar", name: "Aviator C-54 Airplane Bar", shortName: "C-54 Airplane Bar", type: "Future aviation landmark bar", description: "A future one-of-a-kind bar experience planned around an iconic Aviator aircraft.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Coming soon", comingSoon: true, image: "/images/locations/c-54-airplane-bar.png", accessibility: "Accessibility details will be published before opening.", parking: "Campus parking details will be published before opening." },
  { slug: "ready-room", name: "Ready Room Liquor Lounge", shortName: "Ready Room", type: "Cocktails + private events", description: "A private-event room for up to 70 guests including the bar, with aviation-inspired cocktails, a stage, microphone, full sound, and AV capability.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Event hours vary", events: true, image: "/images/locations/ready-room.png", accessibility: "Accessible entry and event seating.", parking: "Campus parking available." },
  { slug: "speakeasy", name: "Aviator Speakeasy Liquor Lounge", shortName: "Speakeasy", type: "Whiskey + cocktails", description: "An intimate lounge for considered cocktails, whiskey, and a little after-hours mystery.", address: "688 Brewing Drive, Fuquay-Varina, NC 27526", phone: "919-567-2337", hours: "Hours coming soon", image: "/images/locations/speakeasy.png", accessibility: "Accessibility details coming soon.", parking: "Campus parking available." },
];

export const beers: Beer[] = [
  { slug: "hogwild-ipa", name: "HogWild IPA", style: "West Coast IPA", abv: "6.7% ABV", category: "IPA", description: "Bright, bitter, and unapologetically hoppy with a clean finish.", status: "Year-round", image: "/images/products/hogwild.png" },
  { slug: "3bones-kolsch", name: "3Bones Kölsch", style: "Kölsch", abv: "4.9% ABV", category: "Ale", description: "Crisp, delicate, and built for an easy second round.", status: "Year-round", image: "/images/products/3bones.png" },
  { slug: "aviator-lager", name: "Aviator Lager", style: "American Lager", abv: "4.8% ABV", category: "Lager", description: "Clean, refreshing, and always ready for the next adventure.", status: "Year-round", image: "/images/products/aviator-lager.png" },
  { slug: "airlift-pilsner", name: "Airlift Pilsner", style: "Pilsner", abv: "5.2% ABV", category: "Lager", description: "A crisp pour with classic noble-hop character.", status: "Year-round", image: "/images/products/airlift.png" },
  { slug: "costa-baja", name: "Costa Baja", style: "Mexican Lager", abv: "4.7% ABV", category: "Lager", description: "Sun-ready, lime-friendly, and made for a long afternoon.", status: "Seasonal", image: "/images/products/costa-baja.png" },
  { slug: "hangar-gold", name: "Hangar Gold", style: "Helles Lager", abv: "5.0% ABV", category: "Lager", description: "Golden, smooth, and malt-balanced with a clean landing.", status: "Year-round", image: "/images/products/hangar-gold.png" },
  { slug: "blackmamba-stout", name: "BlackMamba Stout", style: "Stout", abv: "6.5% ABV", category: "Dark Beer", description: "Chocolatey, full-bodied, and silky from the first sip to the last.", status: "Year-round", image: "/images/products/blackmamba-approved.png" },
  { slug: "devils-tramping-ground", name: "Devils Tramping Ground Tripel", style: "Belgian Tripel", abv: "9.2% ABV", category: "High Gravity", description: "Golden, fruity, lightly spiced, and deceptively smooth.", status: "Year-round", image: "/images/products/devils.png" },
  { slug: "nightjump", name: "NightJump", style: "Imperial Stout", abv: "10.0% ABV", category: "Limited Release", description: "A rich, deep release for darker nights and bigger stories.", status: "Limited", image: "/images/black-mamba.jpg" },
];

export const beyondBeer: BeyondBeer[] = [
  { slug: "aviator-root-beer", name: "Aviator Root Beer", category: "Soda", description: "A classic, full-flavor soda made for the whole crew.", note: "Non-alcoholic - Family friendly", image: "/images/products/root-beer-cream-soda.png" },
  { slug: "aviator-cream-soda", name: "Aviator Cream Soda", category: "Soda", description: "A smooth, nostalgic companion for the next campus stop.", note: "Non-alcoholic - Family friendly", image: "/images/products/root-beer-cream-soda.png" },
  { slug: "strawberry-wave", name: "Strawberry Wave", category: "THC Soda", description: "A bright THC soda option from the Aviator beverage lineup.", note: "21+ only - Enjoy responsibly", image: "/images/products/strawberry-wave-thc.png" },
  { slug: "orange-dream", name: "Orange Dream", category: "THC Soda", description: "A citrus-forward THC soda option for the adult beverage lineup.", note: "21+ only - Enjoy responsibly", image: "/images/products/orange-dream-thc.png" },
  { slug: "aviator-seltzer", name: "Aviator Seltzer", category: "Seltzer", description: "A crisp Aviator seltzer for an easy, refreshing landing.", note: "Availability varies by location", image: "/images/products/seltzer.png" },
];

export const musicVenues: MusicVenue[] = [
  { name: "Aviator Amphitheater", setting: "Outdoor concert venue", description: "Big-stage energy for concerts, festivals, and campus nights under the open sky.", location: "Aviator Brewery Campus" },
  { name: "Ready Room Stage", setting: "Intimate indoor stage", description: "A full-service indoor event room with a stage, microphone, full sound, and AV capability for celebrations, meetings, and live sets.", location: "Ready Room Liquor Lounge" },
  { name: "Hangar Bar Stage", setting: "Brewery stage", description: "Live local music where fresh beer, food, and the flagship crowd meet.", location: "Aviator Hangar Bar" },
  { name: "Aviator Pizza Pub Backyard", setting: "Backyard music space", description: "A relaxed outdoor setting built for pizza, pints, and an easy live set.", location: "Aviator Pizza Pub" },
  { name: "TapHouse Patio", setting: "Patio sessions", description: "An open-air stop for neighborhood music and a classic Aviator night out.", location: "Aviator TapHouse" },
];

export const events: Event[] = [
  { slug: "live-at-the-hangar", title: "Live at the Hangar", date: "Every Friday", time: "7:00–10:00 PM", venue: "Aviator Hangar Bar", description: "Local music, fresh pours, and an easy way to start the weekend.", image: "/images/hero-campus.jpg", cta: "Get directions" },
  { slug: "sunday-brunch-flight", title: "Sunday Brunch Flight", date: "Every Sunday", time: "10:00 AM–2:00 PM", venue: "Morning Hangar", description: "Brunch plates, brunch cocktails, and a slow morning at the brewery.", image: "/images/food.jpg", cta: "View menus" },
  { slug: "cars-coffee-campus", title: "Cars + Coffee on Campus", date: "First Saturday", time: "9:00 AM–12:00 PM", venue: "Aviator Brewery Campus", description: "Bring the ride, meet the community, and stay for the first pint.", image: "/images/beer-taps.jpg", cta: "Get directions" },
];

export const pageContent: Record<string, { eyebrow: string; title: string; description: string; action: string; form?: "contact" | "event" | "career" | "band" | "donation" | "job" }> = {
  distillery: { eyebrow: "Gold Leaf Distilling", title: "A new spirit of Aviator.", description: "Handcrafted cocktails and distilling experiences are part of the next Aviator chapter.", action: "Visit the campus" },
  "private-events": { eyebrow: "Private Events", title: "Make your next gathering take off.", description: "Private events are hosted in the Ready Room: an aviation-inspired room for up to 70 guests including the bar, with a stage, microphone, full sound, AV capability, menus, and an experienced crew ready to help.", action: "Plan your event", form: "event" },
  careers: { eyebrow: "Careers", title: "Come work where the good times are made.", description: "We’re looking for thoughtful, energetic people who love hospitality, craft, and community.", action: "Tell us about yourself", form: "career" },
  contact: { eyebrow: "Contact", title: "We’d love to hear from you.", description: "Questions, feedback, group visits, and general Aviator notes all land here.", action: "Send a message", form: "contact" },
  shop: { eyebrow: "Gift Cards + Merchandise", title: "Bring Aviator with you.", description: "Gift cards, merchandise, and more are landing here soon. Until then, visit the brewery campus for Aviator goods.", action: "Get directions" },
  faq: { eyebrow: "Frequently Asked Questions", title: "A few things before you fly in.", description: "Hours, parking, menus, private events, and the practical details you need for an easy visit.", action: "Contact us" },
  "donation-requests": { eyebrow: "Donation Requests", title: "Good causes deserve a strong tailwind.", description: "Share your organization, upcoming need, and the impact you are making in our community.", action: "Request support", form: "donation" },
  "apply-for-a-job": { eyebrow: "Join the Crew", title: "Make good times happen.", description: "From the brewery to the kitchen, bar, events, and hospitality, tell us where you would like to contribute.", action: "Apply now", form: "job" },
};
