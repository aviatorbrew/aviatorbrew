export type ItineraryPhase = "drinks" | "appetizer" | "dinner";

export type ItineraryStop = {
  id: string;
  locationSlug: string;
  name: string;
  label: string;
  phase: ItineraryPhase;
  comingSoon?: boolean;
  image: string;
  address: string;
  description: string;
  menuUrl?: string;
  highlights: { name: string; detail: string }[];
};

export const drinksStops: ItineraryStop[] = [
  {
    id: "speakeasy-drinks",
    locationSlug: "speakeasy",
    name: "Aviator Speakeasy Liquor Lounge",
    label: "Speakeasy Liquor Lounge",
    phase: "drinks",
    image: "/images/locations/speakeasy.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "A quieter first stop built around whiskey, cocktails, and the Thursday Buffalo Trace feature.",
    menuUrl: "/media/menus/speakeasy/drinks/1785011736450-Whiskey-Bar-Menu-v22.pdf",
    highlights: [
      { name: "$10 Buffalo Trace Thursday", detail: "Buffalo Trace Old Fashioned Thursday feature" },
      { name: "Mach One", detail: "Rye, honey, citrus, and bitters - $13" },
      { name: "Velvet Runway", detail: "Bourbon, cold brew, and simple syrup - $13" },
    ],
  },
  {
    id: "hangar-outside-drinks",
    locationSlug: "hangar-bar",
    name: "Aviator Hangar Bar",
    label: "Hangar Bar Outside Bar",
    phase: "drinks",
    image: "/images/locations/hangar-bar.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "Fresh brewery pours and cocktails outside at the center of the brewery campus.",
    menuUrl: "/media/menus/hangar-bar/drinks/1784992744058-Hangar-Beer-Menu-v38.pdf",
    highlights: [
      { name: "Aviator Old Fashioned", detail: "Bulleit Bourbon, bitters, simple syrup, and orange" },
      { name: "Aviator Rock and Rye", detail: "Rye whiskey, orange peel, and simple syrup" },
      { name: "Brown Sugar Bourbon Smash", detail: "Bourbon, ginger beer, and cinnamon sugar" },
    ],
  },
  {
    id: "taphouse-drinks",
    locationSlug: "taphouse",
    name: "Aviator TapHouse",
    label: "TapHouse",
    phase: "drinks",
    image: "/images/locations/taphouse.png",
    address: "600 E. Broad St., Fuquay-Varina, NC 27526",
    description: "Start downtown at the original Aviator with a house beer or a bourbon-forward cocktail.",
    menuUrl: "/media/menus/taphouse/drinks/1785011506479-TapHouse-Beer-Menu-ver-168.pdf",
    highlights: [
      { name: "Working Man's Lunch", detail: "22 oz. 3Bones and a house-whiskey shot - $10" },
      { name: "Aviator Old Fashioned", detail: "Bulleit Bourbon, bitters, simple syrup, and orange" },
      { name: "Maple Bacon Old Fashioned", detail: "Woodinville maple syrup and real maple bacon" },
    ],
  },
  {
    id: "pizza-rooftop-drinks",
    locationSlug: "pizza-pub",
    name: "Aviator Pizza Pub",
    label: "Pizza Pub Rooftop Bar",
    phase: "drinks",
    image: "/images/locations/pizza-pub.png",
    address: "601 E. Broad St., Fuquay-Varina, NC 27526",
    description: "A rooftop first round downtown with Aviator beer, cocktails, and Broad Street views.",
    menuUrl: "/media/menus/pizza-pub/drinks/1785011703224-Pizza-Beer-Menu-v79.pdf",
    highlights: [
      { name: "Orange Crush", detail: "Orange vodka, triple sec, fresh orange, and Starry" },
      { name: "Blackberry Margarita", detail: "A classic margarita with blackberry syrup" },
      { name: "Aviator Old Fashioned", detail: "Maker's Mark, bitters, simple syrup, and orange" },
    ],
  },
];

export const appetizerStops: ItineraryStop[] = [
  {
    id: "taphouse-appetizers",
    locationSlug: "taphouse",
    name: "Aviator TapHouse",
    label: "TapHouse Starters",
    phase: "appetizer",
    image: "/images/locations/taphouse.png",
    address: "600 E. Broad St., Fuquay-Varina, NC 27526",
    description: "Start downtown with shareable plates before the main stop.",
    menuUrl: "/media/menus/taphouse/food/1785011503692-TapHouse-Menu-ver-319.pdf",
    highlights: [
      { name: "Aviator Bavarian Pretzel", detail: "Lager queso and honey mustard - $12" },
      { name: "Loaded Tots", detail: "Crispy tots, cheese, bacon, scallions, and sauce" },
      { name: "Wings", detail: "Aviator sauces built for the first round" },
    ],
  },
  {
    id: "pizza-pub-appetizers",
    locationSlug: "pizza-pub",
    name: "Aviator Pizza Pub",
    label: "Pizza Pub Shares",
    phase: "appetizer",
    image: "/images/locations/pizza-pub.png",
    address: "601 E. Broad St., Fuquay-Varina, NC 27526",
    description: "A quick Broad Street stop for wings, slices, and shareables.",
    menuUrl: "/media/menus/pizza-pub/food/1785011695064-Pizza-Menu-ver-154.pdf",
    highlights: [
      { name: "Brick-oven pizza", detail: "Small pies are easy to split before dinner" },
      { name: "Hot Honey Pizza", detail: "Pepperoni, red onion, ricotta, and hot honey" },
      { name: "Pub wings", detail: "A classic beer-and-appetizer stop" },
    ],
  },
  {
    id: "hangar-bar-appetizers",
    locationSlug: "hangar-bar",
    name: "Aviator Hangar Bar",
    label: "Hangar Bar Shares",
    phase: "appetizer",
    image: "/images/locations/hangar-bar.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "Campus shareables with the brewery energy already around you.",
    menuUrl: "/media/menus/hangar-bar/food/1784992728085-Hangar-Bar-v81.pdf",
    highlights: [
      { name: "Big Bavarian Pretzel", detail: "Beer cheese and house honey mustard - $12" },
      { name: "Wings", detail: "Aviator sauces and brewery-campus crowd energy" },
      { name: "Smoked pork bites", detail: "A good bridge into dinner plans" },
    ],
  },
];

export const dinnerStops: ItineraryStop[] = [
  {
    id: "taphouse-dinner",
    locationSlug: "taphouse",
    name: "Aviator TapHouse",
    label: "TapHouse",
    phase: "dinner",
    image: "/images/locations/taphouse.png",
    address: "600 E. Broad St., Fuquay-Varina, NC 27526",
    description: "Gastropub dinner at the original Aviator in historic Varina.",
    menuUrl: "/media/menus/taphouse/food/1785011503692-TapHouse-Menu-ver-319.pdf",
    highlights: [
      { name: "Black Barrel Bacon Smash", detail: "Two patties, bacon, pickles, and bourbon BBQ - $17" },
      { name: "BlackMamba Corned Beef Reuben", detail: "House-braised stout corned beef on rye - $17" },
      { name: "Aviator Bavarian Pretzel", detail: "Lager queso and honey mustard - $12" },
    ],
  },
  {
    id: "pizza-pub-dinner",
    locationSlug: "pizza-pub",
    name: "Aviator Pizza Pub",
    label: "Pizza Pub",
    phase: "dinner",
    image: "/images/locations/pizza-pub.png",
    address: "601 E. Broad St., Fuquay-Varina, NC 27526",
    description: "Brick-oven pizza, wings, burgers, and brewery beer across from the TapHouse.",
    menuUrl: "/media/menus/pizza-pub/food/1785011695064-Pizza-Menu-ver-154.pdf",
    highlights: [
      { name: "Hot Honey Pizza", detail: "Pepperoni, red onion, ricotta, and hot honey - $9 / $16" },
      { name: "Meat-a-Palooza", detail: "Six meats on a brick-oven pizza - $10 / $17" },
      { name: "Whiskey Double Smash", detail: "Bacon, white American, and whiskey BBQ - $17" },
    ],
  },
  {
    id: "hangar-bar-dinner",
    locationSlug: "hangar-bar",
    name: "Aviator Hangar Bar",
    label: "Hangar Bar",
    phase: "dinner",
    image: "/images/locations/hangar-bar.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "Brewery-campus dinner with smoked meats, wings, burgers, and beer brewed steps away.",
    menuUrl: "/media/menus/hangar-bar/food/1784992728085-Hangar-Bar-v81.pdf",
    highlights: [
      { name: "House-Smoked Brisket Sandwich", detail: "Brioche, pickled onion, and cheddar - $17" },
      { name: "Aviator Cuban", detail: "Smoked pork, ham, Swiss, pickles, and mustard - $15" },
      { name: "Big Bavarian Pretzel", detail: "Beer cheese and house honey mustard - $12" },
    ],
  },
  {
    id: "harddeck-dinner",
    locationSlug: "harddeck",
    name: "Aviator HardDeck Steakhouse",
    label: "HardDeck Steakhouse",
    phase: "dinner",
    comingSoon: true,
    image: "/images/locations/harddeck.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "The future brewery-campus steakhouse. Visible for future flight plans, but not open yet.",
    highlights: [
      { name: "Coming soon", detail: "Steakhouse menu and opening details are still in development" },
    ],
  },
  {
    id: "c54-dinner",
    locationSlug: "c-54-airplane-bar",
    name: "Aviator C-54 Airplane Bar",
    label: "C-54 Airplane Bar",
    phase: "dinner",
    comingSoon: true,
    image: "/images/locations/c-54-airplane-bar.png",
    address: "688 Brewing Drive, Fuquay-Varina, NC 27526",
    description: "A future one-of-a-kind dining and bar stop built around the C-54 aircraft. Not open yet.",
    highlights: [
      { name: "Coming soon", detail: "Food, drinks, and opening details will be published before launch" },
    ],
  },
];

export const allItineraryStops = [...drinksStops, ...appetizerStops, ...dinnerStops];

export function findItineraryStop(id: string) {
  return allItineraryStops.find((stop) => stop.id === id);
}
