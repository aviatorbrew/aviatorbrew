"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BeyondBeer } from "@/data/site";

export function BeyondBeerImageViewer({ product }: { product: BeyondBeer }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  function openViewer() { setZoom(1); setOpen(true); }

  const lightbox = open ? createPortal(<div className="beer-image-lightbox" role="dialog" aria-modal="true" aria-label={product.name + " full-screen artwork"}>
    <header><div><p>{product.category}</p><h2>{product.name}</h2></div><button ref={closeButton} className="beer-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close full-screen beverage artwork">×</button></header>
    <div className="beer-lightbox-stage"><img src={product.image} alt={product.name + " full-size artwork"} style={zoom === 1 ? { width: "100%", height: "100%", objectFit: "contain" } : { width: (zoom * 100) + "%", height: "auto", maxWidth: "none", maxHeight: "none" }} /></div>
    <footer><p>{product.description} {product.note}</p><div className="beer-lightbox-zoom" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))} disabled={zoom === 1} aria-label="Zoom out">−</button><output aria-live="polite">{zoom}×</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .5))} disabled={zoom === 3} aria-label="Zoom in">+</button></div><a href={product.image} target="_blank" rel="noreferrer">Open original</a></footer>
  </div>, document.body) : null;

  return <><button className="beyond-beer-image-trigger" type="button" onClick={openViewer} aria-label={"View " + product.name + " artwork full screen"}><Image src={product.image} alt={product.name + " beverage artwork"} fill unoptimized sizes="(max-width: 680px) 100vw, (max-width: 1020px) 50vw, 33vw" /><span className="beer-image-expand" aria-hidden="true" data-tooltip="View full size">↗</span></button>{lightbox}</>;
}
