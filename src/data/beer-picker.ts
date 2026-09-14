// Reviewed against the published drink menus. See docs/design/beer-picker.md.
export const beerMenuSources = {
  hangar: { label: "Hangar Bar beer menu", date: "July 7, 2026", url: "/api/menu-files/hangar-bar/drinks/1784992744058-Hangar-Beer-Menu-v38.pdf" },
  taphouse: { label: "TapHouse beer menu", date: "June 25, 2026", url: "/api/menu-files/taphouse/drinks/1785011506479-TapHouse-Beer-Menu-ver-168.pdf" },
  pizza: { label: "Pizza Pub beer menu", date: "June 25, 2026", url: "/api/menu-files/pizza-pub/drinks/1785011703224-Pizza-Beer-Menu-v79.pdf" },
} as const;

export const flavorChoices = [
  { value: "any", label: "Help me explore" },
  { value: "crisp", label: "Light & crisp" },
  { value: "fruit", label: "Fruity & juicy" },
  { value: "hops", label: "Hoppy & aromatic" },
  { value: "smooth", label: "Smooth & lightly sweet" },
  { value: "malt", label: "Malty & rich" },
  { value: "tart", label: "Tart & tangy" },
] as const;
export type Flavor = typeof flavorChoices[number]["value"];
export type BeerProfile = { name: string; aliases: string[]; style: string; abv: number; flavors: Exclude<Flavor, "any">[]; notes: string; source: keyof typeof beerMenuSources };

export const beerProfiles: BeerProfile[] = [
  { name: "Hangar Gold", aliases: [], style: "Helles lager", abv: 5, flavors: ["crisp", "malt"], notes: "Smooth malt, subtle noble hops, and a crisp, clean finish.", source: "hangar" },
  { name: "Bee-17 Honey Ale", aliases: [], style: "Honey ale", abv: 5.8, flavors: ["smooth", "crisp"], notes: "Local wildflower honey brings floral aromas and a little sweetness, with a smooth golden body and crisp finish.", source: "hangar" },
  { name: "Jetstream IPA", aliases: ["JetStream"], style: "Tropical IPA", abv: 6.4, flavors: ["fruit", "hops"], notes: "Passion fruit, pineapple, and citrus flavors from Nectaron, Mosaic, Riwaka, and Galaxy hops.", source: "hangar" },
  { name: "Aviator Lite", aliases: ["Lite"], style: "Light beer", abv: 4.2, flavors: ["crisp"], notes: "The menu’s light beer option, brewed with flavor at 4.2% ABV.", source: "hangar" },
  { name: "Aviator Lager", aliases: ["Lager"], style: "Lager", abv: 5, flavors: ["crisp"], notes: "A cold-brewed lager with a clean, refreshing character.", source: "hangar" },
  { name: "Airlift Pilsner", aliases: ["Airlift Pils"], style: "Pilsner", abv: 5.5, flavors: ["crisp", "malt"], notes: "A golden pilsner with a smooth malt body, flavorful hops, and a crisp finish.", source: "hangar" },
  { name: "ShoGun Rice Lager", aliases: [], style: "Rice lager", abv: 5.1, flavors: ["crisp"], notes: "Clean and crisp, with delicate floral hops, a touch of sweetness, and a dry finish.", source: "pizza" },
  { name: "3Bones Kölsch", aliases: ["3Bones"], style: "Kölsch ale", abv: 5.2, flavors: ["crisp"], notes: "A Cologne-inspired Kölsch, listed in the menu’s light-in-color selection.", source: "hangar" },
  { name: "MadBeach Wheat", aliases: ["MadBeach"], style: "Orange wheat ale", abv: 4.8, flavors: ["fruit"], notes: "White wheat and pale ale malt infused with fresh oranges.", source: "taphouse" },
  { name: "MadPeach Wheat", aliases: ["MadPeach"], style: "Peach wheat ale", abv: 4.8, flavors: ["fruit"], notes: "White wheat and pale ale malt infused with fresh peaches.", source: "taphouse" },
  { name: "SharkFight", aliases: ["SharkFight Orange & Grapefruit Ale", "SharkFight American Wheat"], style: "Citrus wheat ale", abv: 5.2, flavors: ["fruit"], notes: "Orange and grapefruit bring a juicy citrus punch to a wheat ale.", source: "hangar" },
  { name: "Apple Lite", aliases: [], style: "Apple-infused light beer", abv: 4.2, flavors: ["fruit", "crisp"], notes: "Crisp apple flavor, a little sweetness, and a smooth finish.", source: "hangar" },
  { name: "Bee-17 Mango Honey Ale", aliases: [], style: "Mango honey ale", abv: 5.8, flavors: ["fruit", "smooth"], notes: "Juicy mango and local wildflower honey make a bright, refreshing ale.", source: "hangar" },
  { name: "PurpleHaze", aliases: ["PurpleHaze IPA"], style: "Blackberry IPA", abv: 6.7, flavors: ["fruit", "hops"], notes: "Blackberry fruit meets tropical hop character in this fruit-infused IPA.", source: "hangar" },
  { name: "Pineapple Chaos IPA", aliases: ["Pineapple Chaos"], style: "Pineapple IPA", abv: 5, flavors: ["fruit", "hops"], notes: "Pineapple-infused, hop-forward IPA brewed with Mosaic and Citra.", source: "pizza" },
  { name: "Hopocalypse Now", aliases: [], style: "East Coast IPA", abv: 6, flavors: ["hops"], notes: "Bold citrus and pine aromas with a smooth, balanced character; the menu describes it as an IPA without the bitterness.", source: "taphouse" },
  { name: "HogWild IPA", aliases: ["HogWild"], style: "West Coast IPA", abv: 6.7, flavors: ["hops"], notes: "Aviator’s original West Coast IPA, brewed with Centennial, Apollo, Cascade, Chinook, and Nugget hops.", source: "hangar" },
  { name: "Maximum OverHop Double IPA", aliases: ["Maximum Overhop"], style: "Double West Coast IPA", abv: 8, flavors: ["hops"], notes: "Intense hop character with bright citrus, pine, and resinous bitterness.", source: "hangar" },
  { name: "Jet Juice", aliases: ["Jet Juice 5 IPA", "Jet Juice Hazy IPA"], style: "Tropical IPA", abv: 8, flavors: ["fruit", "hops"], notes: "Tropical fruit and bright citrus flavor in an 8% IPA.", source: "hangar" },
  { name: "Cosmic Crush IPL", aliases: ["Cosmic Crush"], style: "India pale lager", abv: 6.1, flavors: ["fruit", "hops"], notes: "A cold-brewed India pale lager with Amarillo, Citra, and Mosaic hops and intense stone-fruit flavors.", source: "taphouse" },
  { name: "Blueberry WarHead Sour", aliases: [], style: "Blueberry sour", abv: 5.1, flavors: ["fruit", "tart"], notes: "Bright blueberry flavor with a puckering, candy-like tartness.", source: "hangar" },
  { name: "HotRod Red Ale", aliases: ["HotRod Red"], style: "Red ale", abv: 6.1, flavors: ["malt", "hops"], notes: "A red ale from the menu’s malty selection, with a slightly hoppy edge from Cascade and Centennial.", source: "hangar" },
  { name: "BlackMamba Oatmeal Stout", aliases: ["BlackMamba"], style: "Oatmeal stout", abv: 6.5, flavors: ["malt"], notes: "A full-bodied oatmeal stout from the menu’s dark beer selection.", source: "hangar" },
  { name: "Mezzanotte Porter", aliases: ["Mezzanotte"], style: "Porter", abv: 6, flavors: ["malt"], notes: "A dark porter infused with tiramisu flavors.", source: "pizza" },
  { name: "Devils Tramping Ground Tripel Ale", aliases: ["Devils Tripel", "Devil’s Tramping Ground Tripel", "Devils Tramping Ground"], style: "Belgian tripel", abv: 9.2, flavors: ["smooth"], notes: "A light-colored Belgian tripel with sweetness on the finish. Its pale color does not mean lower alcohol: this one is 9.2% ABV.", source: "hangar" },
  { name: "Berserker", aliases: [], style: "Malt-forward ale", abv: 11, flavors: ["malt"], notes: "Layers of caramel, toffee, and dark fruit with a warm, smooth finish.", source: "hangar" },
  { name: "Skyhammer Imperial Wheat", aliases: ["Skyhammer"], style: "Imperial wheat", abv: 8.2, flavors: [], notes: "An imperial wheat beer listed at 8.2% ABV in the menu’s light-in-color selection.", source: "hangar" },
];
