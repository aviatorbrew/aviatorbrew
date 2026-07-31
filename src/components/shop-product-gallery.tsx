"use client";

import { useState } from "react";

export function ShopProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(images[0] || "");
  if (!active) return <div className="shop-new-image is-empty"><span>AVIATOR</span></div>;
  return <div className="shop-product-gallery"><div className="shop-new-image"><img src={active} alt={name} /></div>{images.length > 1 ? <div className="shop-product-thumbs" aria-label={name + " photos"}>{images.map((image, index) => <button type="button" className={active === image ? "is-active" : ""} onClick={() => setActive(image)} aria-label={"Show photo " + (index + 1)} key={image}><img src={image} alt="" /></button>)}</div> : null}</div>;
}
