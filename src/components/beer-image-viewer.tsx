"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Beer } from "@/data/site";

const isPdf = (source: string) => source.toLowerCase().split("?")[0].endsWith(".pdf");

export function BeerImageViewer({ beer, className = "beer-image", priority = false }: { beer: Beer; className?: string; priority?: boolean }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pdf = isPdf(beer.image);

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

  const lightbox = open ? createPortal(<div className="beer-image-lightbox" role="dialog" aria-modal="true" aria-label={`${beer.name} full-screen artwork`}>
      <header>
        <div><p>{beer.style} · {beer.abv}</p><h2>{beer.name}</h2></div>
        <button ref={closeButton} className="beer-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close full-screen beer artwork">×</button>
      </header>
      <div className="beer-lightbox-stage">
        {pdf ? <object data={beer.image} type="application/pdf" aria-label={`${beer.name} artwork PDF`} /> : <img src={beer.image} alt={`${beer.name} full-size beer artwork`} style={zoom === 1 ? { width: "100%", height: "100%", objectFit: "contain" } : { width: `${zoom * 100}%`, height: "auto", maxWidth: "none", maxHeight: "none" }} />}
      </div>
      <footer>
        <p>{beer.description}</p>
        {!pdf ? <div className="beer-lightbox-zoom" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))} disabled={zoom === 1} aria-label="Zoom out">−</button><output aria-live="polite">{zoom}×</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .5))} disabled={zoom === 3} aria-label="Zoom in">+</button></div> : null}
        <a href={beer.image} target="_blank" rel="noreferrer">Open original</a>
        <Link href={`/beer/${beer.slug}`} onClick={() => setOpen(false)}>Beer details</Link>
      </footer>
    </div>, document.body) : null;

  return <>
    <button className={`${className} beer-image-trigger`} type="button" onClick={openViewer} aria-label={`View ${beer.name} artwork full screen`}>
      {pdf ? <object className="beer-pdf-artwork" data={beer.image} type="application/pdf" tabIndex={-1} aria-hidden="true" /> : <Image src={beer.image} alt={`${beer.name} beer artwork`} fill priority={priority} unoptimized sizes="(max-width: 700px) 50vw, 33vw" />}
      <span className="beer-image-expand" aria-hidden="true" data-tooltip="View full size">↗</span>
    </button>
    {lightbox}
  </>;
}
