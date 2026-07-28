import type { BeyondBeer } from "@/data/site";
import { BeyondBeerImageViewer } from "@/components/beyond-beer-image-viewer";

const menus = [
  { id: "soda", title: "Soda", eyebrow: "Family-friendly flight", description: "Classic Aviator sodas for every member of the crew.", category: "Soda" },
  { id: "thc-soda", title: "THC Soda", eyebrow: "Adult beverage flight · 21+", description: "Bright, ready-to-enjoy THC sodas. Availability varies by location and applicable law.", category: "THC Soda" },
  { id: "seltzer", title: "Seltzer", eyebrow: "Refreshment flight", description: "Crisp Aviator seltzers for an easy, refreshing landing.", category: "Seltzer" },
] as const;

export function BeyondBeerGallery({ products }: { products: BeyondBeer[] }) {
  return <div className="beyond-beer-deck">
    <nav className="beverage-menu-nav" aria-label="Beverage menus">
      {menus.map((menu, index) => <a href={"#" + menu.id} key={menu.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{menu.title}</strong><i aria-hidden="true">↓</i></a>)}
    </nav>
    <div className="beverage-menu-stack">{menus.map((menu) => {
      const menuProducts = products.filter((product) => product.category === menu.category);
      return <section className="beverage-menu-section" id={menu.id} key={menu.id}>
        <header><div><p className="eyebrow">{menu.eyebrow}</p><h3>{menu.title}</h3></div><p>{menu.description}</p></header>
        <div className="beyond-beer-grid">{menuProducts.map((product) => <article className="beyond-beer-card" key={product.slug}>
          <div className="beyond-beer-image"><BeyondBeerImageViewer product={product} /></div>
          <div className="beyond-beer-card-copy"><p>{product.category}</p><h4>{product.name}</h4><span>{product.description}</span><strong>{product.note}</strong></div>
        </article>)}</div>
      </section>;
    })}</div>
  </div>;
}
