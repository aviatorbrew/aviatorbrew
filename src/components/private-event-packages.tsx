import { ArrowUpRight } from "@/components/icons";

type PrivateEventPackagesProps = {
  bookingFeeLabel: string;
  menuUrl?: string;
};

const packages = [
  {
    name: "The Brewery Social",
    price: 32,
    note: "An easygoing spread for casual celebrations.",
    includes: ["Choose 2 appetizers", "Choose 2 entrees", "Choose 2 sides"],
    tone: "social",
  },
  {
    name: "The Aviator Feast",
    price: 38,
    note: "More variety for a hungry crowd.",
    includes: ["Choose 3 appetizers", "Choose 2 entrees", "Choose 1 salad", "Choose 2 sides"],
    tone: "feast",
  },
  {
    name: "The Ready Room Dinner",
    price: 44,
    note: "A premium buffet built for a big occasion.",
    includes: ["Choose 3 appetizers", "Choose 2 premium entrees", "Choose 1 salad", "Choose 2 sides"],
    tone: "dinner",
  },
] as const;

const menuGroups = [
  {
    name: "Appetizers",
    items: [
      "Hush Puppies",
      "Loaded Tots",
      "Chips & Salsa",
      "Aviator Chicken Tenders with Aviator Sauce",
      "Caprese Skewers",
      "Brisket Crostini|+$2 / guest",
      "Shrimp Cocktail|+$3 / guest",
    ],
  },
  {
    name: "Entrees",
    items: [
      "Aviator Pizzeria Pizza Bar|Choose up to 3 classic styles",
      "Aviator Pulled Pork BBQ",
      "Country Fried Chicken Cutlet",
      "Bacon-Wrapped Meatloaf",
      "Aviator Chicken Tenders",
      "Aviator Smoked Wings|Dry Rub, Aviator, Buffalo, BlackMamba or Monster",
      "Aviator Beef Brisket|+$4 / guest",
      "Grilled Flat Iron Steak with Collard Green Chimichurri|+$6 / guest",
    ],
  },
  {
    name: "Premium entrees",
    items: [
      "Grilled Flat Iron Steak with Collard Green Chimichurri",
      "Aviator Beef Brisket",
      "Herb-Roasted Chicken",
      "Bourbon-Glazed Chicken",
      "Country Fried Chicken Cutlet",
      "Aviator Pulled Pork BBQ",
    ],
  },
  {
    name: "Sides",
    items: ["Mac & Cheese", "Collard Greens", "Broccoli Salad", "Tomato Cucumber Salad", "Potato Salad", "French Fries", "Tater Tots"],
  },
  {
    name: "Salads",
    items: ["Caesar Salad", "Greek Salad", "Spinach Caprese Salad", "Chicken Cobb Salad"],
  },
] as const;

const classicPizzas = ["Just the Cheese", "Ultimate Pepperoni", "The Aviator", "Veggie", "MadBeach"];
const specialtyPizzas = ["Hot Honey", "Buffalo", "Caprese", "Crash & Burn", "Meat-a-Palooza", "MadBeach Heat", "BBQ Chicken"];

function MenuGroup({ group }: { group: (typeof menuGroups)[number] }) {
  return <article className="private-event-menu-group">
    <h4>{group.name}</h4>
    <ul>{group.items.map((item) => {
      const [name, detail] = item.split("|");
      return <li key={item}><span>{name}</span>{detail ? <small>{detail}</small> : null}</li>;
    })}</ul>
  </article>;
}

export function PrivateEventPackages({ bookingFeeLabel, menuUrl }: PrivateEventPackagesProps) {
  return <section className="private-event-packages-section" id="packages" aria-labelledby="private-event-packages-title">
    <div className="content-wrap">
      <header className="private-event-packages-heading">
        <div><p className="eyebrow">Ready Room packages</p><h2 id="private-event-packages-title">Pick the package. <em>We&apos;ll handle the rest.</em></h2></div>
        <p>Every package includes buffet-style service, iced tea, soft drinks, water, and a dedicated bartender. Taxes and gratuity are additional.</p>
      </header>

      <div className="private-event-quick-facts" aria-label="Private event package details">
        <span><strong>4 hours</strong> guest event time</span>
        <span><strong>30</strong> guest minimum</span>
        <span><strong>70</strong> indoor capacity</span>
        <span><strong>{bookingFeeLabel}</strong> deposit applied to your bill</span>
      </div>

      <div className="private-event-package-grid">
        {packages.map((item, index) => <article className={"private-event-package-card is-" + item.tone} key={item.name}>
          <span className="private-event-package-number">0{index + 1}</span>
          <p>{item.note}</p>
          <h3>{item.name}</h3>
          <div className="private-event-package-price"><strong><span aria-hidden="true">$</span>{item.price}</strong><span>/ guest</span></div>
          <ul>{item.includes.map((line) => <li key={line}>{line}</li>)}</ul>
          <footer>Drinks included · 30 guest minimum</footer>
        </article>)}
      </div>

      <aside className="private-event-pizza-bar" id="pizza-bar">
        <div className="private-event-pizza-intro">
          <p className="eyebrow">Now boarding from Aviator Pizzeria</p>
          <h3>Aviator Pizzeria <em>Pizza Bar</em></h3>
          <p>Give the party a brick-oven upgrade without leaving the Ready Room package structure. Pizza can count as one included entree in The Brewery Social or The Aviator Feast.</p>
          <ul>
            <li><strong>Choose up to 3 styles</strong> for the buffet</li>
            <li><strong>2 slices per guest</strong> when selected as an entree</li>
            <li><strong>+$8 / guest</strong> to add a Pizza Bar as an extra entree</li>
            <li><strong>Gluten-free pizzas</strong> available with advance notice</li>
          </ul>
        </div>
        <div className="private-event-pizza-flights">
          <article><span>Included flight</span><h4>Classic pizzas</h4><p>{classicPizzas.join(" · ")}</p></article>
          <article><span>+$2 / guest</span><h4>Specialty flight</h4><p>{specialtyPizzas.join(" · ")}</p></article>
          <small>Pizza selections and dietary accommodations are confirmed with your event coordinator. Pizzas are replenished in batches for a fresher buffet.</small>
        </div>
      </aside>

      <div className="private-event-build-heading">
        <div><p className="eyebrow">Build your package</p><h3>See every food choice.</h3></div>
        <p>Start with a package above, then mix and match the selections that fit your crowd.</p>
      </div>
      <div className="private-event-menu-grid">{menuGroups.map((group) => <MenuGroup group={group} key={group.name} />)}</div>

      <div className="private-event-extras-grid">
        <article>
          <p className="eyebrow">Event extras</p><h3>Make it yours.</h3>
          <dl>
            <div><dt>Additional event hour</dt><dd>$100</dd></div>
            <div><dt>Additional appetizer</dt><dd>+$5 / guest</dd></div>
            <div><dt>Additional entree</dt><dd>+$8 / guest</dd></div>
            <div><dt>Dessert display</dt><dd>+$6 / guest</dd></div>
            <div><dt>Coffee service</dt><dd>+$3 / guest</dd></div>
          </dl>
        </article>
        <article>
          <p className="eyebrow">The bar</p><h3>Choose your setup.</h3>
          <p>Keep it simple with a guest-paid bar, arrange a hosted tab with your event coordinator, or offer drink tickets. Aviator beer is on tap, with liquor and wine available. There is no required drink package.</p>
          <p><strong>Included with the room:</strong> big-screen presentation setup, house sound system, and microphone.</p>
        </article>
      </div>

      <aside className="private-event-decor-policy" aria-labelledby="private-event-decor-title">
        <div className="private-event-decor-intro">
          <p className="eyebrow">Event timing + decorating</p>
          <h3 id="private-event-decor-title">Four hours. One easy setup window.</h3>
          <p>Each Ready Room booking includes four hours of guest event time, one hour of decorating access before the scheduled start, and 30 minutes afterward for decoration removal and room reset. Setup and removal time do not extend guest event time. Additional event time is &#36;100 per hour and must be arranged in advance.</p>
        </div>
        <div className="private-event-decor-rules">
          <article>
            <h4>Welcome aboard</h4>
            <ul><li>Tabletop and freestanding decorations</li><li>Weighted balloons, florals, signs, and easels</li><li>Battery-operated candles</li><li>Approved decorators and vendors</li></ul>
          </article>
          <article>
            <h4>Not permitted</h4>
            <ul><li>Glitter, confetti, rice, or silly string</li><li>Open flames, smoke, or fog machines</li><li>Nails, screws, staples, tape, or wall adhesives</li><li>Items attached to ceilings, lights, sprinklers, or fixtures</li><li>Anything blocking exits, aisles, or safety equipment</li></ul>
          </article>
        </div>
        <p className="private-event-decor-fine-print">All decorations require advance approval. Early access beyond the included hour requires coordinator approval. The host must remove all decorations within the 30-minute removal window and is responsible for damage or excessive cleaning.</p>
      </aside>

      <aside className="private-event-order-form">
        <div>
          <p className="eyebrow">Fillable event order form</p>
          <h3>Ready Room Event Flight Plan</h3>
          <p>Organize your date, schedule, package, menu, Pizza Bar, bar setup, extras, totals, and signatures in one place. Fill it out digitally or print it for handwriting.</p>
        </div>
        <a className="button" href="/documents/ready-room-event-flight-plan.pdf" target="_blank" rel="noreferrer" data-analytics="private_events_flight_plan_pdf">
          Download Event Flight Plan <ArrowUpRight />
        </a>
      </aside>

      <footer className="private-event-package-actions">
        <div><strong>Ready to choose a flight plan?</strong><span>Send your date, guest count, and package ideas to the Aviator events team.</span></div>
        <div>
          <a className="button" href="#inquiry" data-analytics="private_events_packages_inquiry">Plan your event <ArrowUpRight /></a>
          {menuUrl ? <a className="button button-outline" href={menuUrl} target="_blank" rel="noreferrer" data-analytics="private_events_packages_pdf">Download menu PDF <ArrowUpRight /></a> : null}
        </div>
      </footer>
    </div>
  </section>;
}
