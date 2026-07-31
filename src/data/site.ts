export type Location = {
  slug: string; name: string; shortName: string; type: string; description: string;
  address: string; phone: string; hours: string; menu?: string; events?: boolean; comingSoon?: boolean;
  image: string; accessibility: string; parking: string;
};

export type Beer = {
  slug: string; name: string; style: string; abv: string; category: string;
  description: string; status: "Year-round" | "Seasonal" | "Limited"; image: string; published?: boolean;
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
  { label: "Flight Log", href: "/flight-log", featured: true },
  { label: "Beer", href: "/beer" },
  { label: "Brewery", href: "/brewery" },
  { label: "Shop", href: "https://aviatorbrew.myshopify.com/" },
  { label: "Beverage Sales", href: "/kegs" },
  { label: "Locations", href: "/locations" },
  { label: "MORE", href: "/more", children: [{ label: "About", href: "/about" }, { label: "Tours", href: "/about#brewery-tours" }, { label: "Contact Us", href: "/contact" }] },
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
  { slug: "jetstream-ipa", name: "Jetstream IPA", style: "Tropical IPA", abv: "6.4% ABV", category: "IPA", description: "A tropical IPA with passion fruit, pineapple, and citrus character from Nectaron, Mosaic, Riwaka, and Galaxy hops.", status: "Seasonal", image: "/images/products/jetstream-ipa.png" },
  { slug: "maximum-overhop", name: "Maximum OverHop", style: "Double West Coast IPA", abv: "8.0% ABV", category: "IPA", description: "Intense citrus, pine, resinous hop character, and assertive bitterness. Built for hop heads. Expect turbulence.", status: "Limited", image: "/images/products/maximum-overhop.png" },
  { slug: "purplehaze", name: "PurpleHaze", style: "Blackberry Tropical IPA", abv: "6.7% ABV", category: "IPA", description: "A tropical IPA infused with blackberry and funky tropical hop character.", status: "Seasonal", image: "/images/products/purplehaze.png" },
  { slug: "hopocalypse-now", name: "Hopocalypse Now", style: "East Coast IPA", abv: "6.0% ABV", category: "IPA", description: "A full-scale hop invasion packed with flavor without heavy bitterness.", status: "Seasonal", image: "/images/products/hopocalypse-now.png" },
  { slug: "jet-juice-5-ipa", name: "Jet Juice 5 IPA", style: "Tropical IPA", abv: "8.0% ABV", category: "IPA", description: "A bold tropical IPA bursting with bright citrus flavor.", status: "Limited", image: "/images/products/jet-juice-5-ipa.png" },
  { slug: "hogwild-ipa", name: "HogWild IPA", style: "West Coast IPA", abv: "6.7% ABV", category: "IPA", description: "Our West Coast IPA brewed with Centennial, Apollo, Cascade, Chinook, and Nugget hops.", status: "Year-round", image: "/images/products/hogwild.png" },
  { slug: "cosmic-crush-ipl", name: "Cosmic Crush IPL", style: "India Pale Lager", abv: "6.1% ABV", category: "Lager", description: "A cold-brewed lager featuring Amarillo, Citra, and Mosaic hops.", status: "Seasonal", image: "/images/products/cosmic-crush-ipl.png" },
  { slug: "airlift-pilsner", name: "Airlift Pilsner", style: "Pilsner", abv: "5.5% ABV", category: "Lager", description: "A crisp golden pilsner with a smooth malt body and flavorful hop character.", status: "Year-round", image: "/images/products/airlift.png" },
  { slug: "aviator-lager", name: "Aviator Lager", style: "Lager", abv: "5.0% ABV", category: "Lager", description: "A clean, cold-brewed lager with a crisp and refreshing finish.", status: "Year-round", image: "/images/products/aviator-lager.png" },
  { slug: "hangar-gold", name: "Hangar Gold", style: "German-Style Helles Lager", abv: "5.0% ABV", category: "Lager", description: "A crisp helles with smooth malt character, subtle noble hops, and a clean finish.", status: "Year-round", image: "/images/products/hangar-gold.png" },
  { slug: "blackmamba-stout", name: "BlackMamba Oatmeal Stout", style: "Oatmeal Stout", abv: "6.5% ABV", category: "Dark Beer", description: "A full-bodied oatmeal stout with a smooth, creamy body, served on nitro.", status: "Year-round", image: "/images/products/blackmamba-approved.png" },
  { slug: "blueberry-warhead-sour", name: "Blueberry WarHead Sour", style: "Blueberry Sour Ale", abv: "5.1% ABV", category: "Ale", description: "A lip-puckering sour loaded with bright blueberry flavor that pops like Warhead candy.", status: "Seasonal", image: "/images/products/costa-baja.png" },
  { slug: "hotrod-red-ale", name: "HotRod Red Ale", style: "American Red Ale", abv: "6.1% ABV", category: "Ale", description: "A slightly hoppy red ale brewed with Cascade and Centennial hops.", status: "Seasonal", image: "/images/products/hotrod-red-ale.png" },
  { slug: "berserker", name: "Berserker Barleywine", style: "Barleywine-Style Ale", abv: "11.0% ABV", category: "High Gravity", description: "A malt monster layered with caramel, toffee, and dark fruit, finishing warm and smooth.", status: "Limited", image: "/images/products/berserker.png" },
  { slug: "sharkfight-orange-grapefruit-ale", name: "SharkFight Orange & Grapefruit Ale", style: "Citrus Wheat Ale", abv: "5.2% ABV", category: "Ale", description: "A wheat ale infused with grapefruit and orange for a bright, juicy citrus punch.", status: "Seasonal", image: "/images/products/costa-baja.png" },
  { slug: "apple-lite", name: "Apple Lite", style: "Apple Light Beer", abv: "4.2% ABV", category: "Ale", description: "A crisp light beer with fresh apple flavor, gentle sweetness, and a smooth finish.", status: "Seasonal", image: "/images/products/apple-lite.png" },
  { slug: "madbeach-wheat", name: "MadBeach Wheat", style: "Orange Wheat Ale", abv: "4.8% ABV", category: "Ale", description: "Wheat and pale ale malts are infused with fresh orange for a bright citrus wheat ale.", status: "Seasonal", image: "/images/products/costa-baja.png" },
  { slug: "devils-tramping-ground", name: "Devils Tramping Ground Tripel Ale", style: "Belgian Tripel", abv: "9.2% ABV", category: "High Gravity", description: "A classic Belgian Tripel that is light in color with fruity character and gentle sweetness on the finish.", status: "Year-round", image: "/images/products/devils.png" },
  { slug: "skyhammer-imperial-wheat", name: "SkyHammer Imperial Wheat", style: "Imperial Wheat Ale", abv: "8.2% ABV", category: "High Gravity", description: "A bold imperial wheat ale that hits with altitude and attitude.", status: "Limited", image: "/images/products/skyhammer-imperial-wheat.png" },
  { slug: "aviator-lite", name: "Aviator Lite", style: "Light Beer", abv: "4.2% ABV", category: "Lager", description: "A flavorful light beer with 89 calories, low carbohydrates, and high protein.", status: "Year-round", image: "/images/products/aviator-lite.png" },
  { slug: "3bones-kolsch", name: "3Bones Kölsch", style: "Kölsch", abv: "5.2% ABV", category: "Ale", description: "A crisp German-style ale named for Cologne Cathedral, where the relics of the Three Kings are traditionally said to rest.", status: "Year-round", image: "/images/products/3bones.png" },
  { slug: "bee-17-honey-ale", name: "Bee-17 Honey Ale", style: "Honey Ale", abv: "5.8% ABV", category: "Ale", description: "Brewed with 250 pounds of local wildflower honey for floral aroma, subtle honey sweetness, and a crisp finish balanced by earthy-spicy Hallertau hops.", status: "Seasonal", image: "/images/products/bee-17-honey-ale.png" },
  { slug: "bee-17-mango-honey-ale", name: "Bee-17 Mango Honey Ale", style: "Mango Honey Ale", abv: "5.8% ABV", category: "Ale", description: "Local wildflower honey and juicy mango combine in a bright, smooth, and refreshing golden ale.", status: "Seasonal", image: "/images/products/bee-17-mango-honey-ale.png" },
  { slug: "nightjump", name: "NightJump", style: "Imperial Stout", abv: "10.0% ABV", category: "Limited Release", description: "A rich, deep release for darker nights and bigger stories.", status: "Limited", image: "/images/black-mamba.jpg" },
];

export const beyondBeer: BeyondBeer[] = [
  { slug: "orange-dream", name: "Orange Dream THC Soda", category: "THC Soda", description: "Bright orange and smooth vanilla come together in a creamy, refreshing soda.", note: "5 mg THC + 2 mg CBD per 12-ounce can - 21+ only", image: "/images/products/orange-dream-thc.png" },
  { slug: "strawberry-wave", name: "Strawberry Wave THC Soda", category: "THC Soda", description: "Ripe strawberry and creamy vanilla roll together in a smooth, refreshing blend.", note: "5 mg THC + 2 mg CBD per 12-ounce can - 21+ only", image: "/images/products/strawberry-wave-thc.png" },
  { slug: "cucumber-lime-thc-soda", name: "Cucumber Lime THC Soda", category: "THC Soda", description: "Cool cucumber and zesty lime come together in a clean, refreshing blend.", note: "5 mg THC + 2 mg CBD per 12-ounce can - 21+ only", image: "/images/products/thc-seltzer.png" },
  { slug: "aviator-apple-hibiscus", name: "Aviator Apple Hibiscus", category: "Seltzer", description: "A crisp, floral blend of apple and hibiscus.", note: "4.3% ABV - 100% gluten-free", image: "/images/products/seltzer.png" },
  { slug: "aviator-root-beer", name: "Aviator Root Beer", category: "Soda", description: "Our full-flavored craft-brewed root beer in a 16-ounce can.", note: "0.0% ABV - Non-alcoholic - 100% gluten-free", image: "/images/products/root-beer-cream-soda.png" },
  { slug: "aviator-cream-soda", name: "Aviator Cream Soda", category: "Soda", description: "Our smooth craft-brewed cream soda in a 16-ounce can.", note: "0.0% ABV - Non-alcoholic - 100% gluten-free", image: "/images/products/root-beer-cream-soda.png" },
  { slug: "aviator-hop-water", name: "Aviator Hop Water", category: "Soda", description: "Crisp craft-brewed hop water with hop aroma and a refreshing finish.", note: "0.0% ABV - Zero carbs, zero calories, zero alcohol, and 100% gluten-free", image: "/images/products/seltzer.png" },
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
