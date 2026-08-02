"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ShopProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(images[0] || "");
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openViewer() {
    setZoom(1);
    setOpen(true);
  }

  if (!active) return <div className="shop-new-image is-empty"><span>AVIATOR</span></div>;

  const lightbox = open ? createPortal(<div className="beer-image-lightbox shop-image-lightbox" role="dialog" aria-modal="true" aria-label={name + " full-screen product image"}>
    <header><div><p>Aviator Supply Depot</p><h2>{name}</h2></div><button ref={closeButton} className="beer-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close full-screen product image">×</button></header>
    <div className="beer-lightbox-stage"><img src={active} alt={name + " full-size product image"} style={zoom === 1 ? { width: "100%", height: "100%", objectFit: "contain" } : { width: zoom * 100 + "%", height: "auto", maxWidth: "none", maxHeight: "none" }} /></div>
    <footer><p>Review the product image full size before adding it to your cart.</p><div className="beer-lightbox-zoom" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))} disabled={zoom === 1} aria-label="Zoom out">−</button><output aria-live="polite">{zoom}×</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .5))} disabled={zoom === 3} aria-label="Zoom in">+</button></div><a href={active} target="_blank" rel="noreferrer">Open original</a></footer>
  </div>, document.body) : null;

  return <div className="shop-product-gallery"><button className="shop-new-image shop-image-trigger" type="button" onClick={openViewer} aria-label={"View " + name + " product image full size"}><img src={active} alt={name} /><span className="beer-image-expand" aria-hidden="true" data-tooltip="View full size">↗</span></button>{images.length > 1 ? <div className="shop-product-thumbs" aria-label={name + " photos"}>{images.map((image, index) => <button type="button" className={active === image ? "is-active" : ""} onClick={() => setActive(image)} aria-label={"Show photo " + (index + 1)} key={image}><img src={image} alt="" /></button>)}</div> : null}{lightbox}</div>;
}
