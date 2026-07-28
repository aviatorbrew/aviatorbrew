"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function EventImageViewer({ src, alt, title, description }: { src: string; alt: string; title: string; description?: string }) {
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

  const lightbox = open ? createPortal(<div className="beer-image-lightbox" role="dialog" aria-modal="true" aria-label={title + " full-screen event picture"}>
    <header><div><p>Event picture</p><h2>{title}</h2></div><button ref={closeButton} className="beer-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close full-screen event picture">×</button></header>
    <div className="beer-lightbox-stage"><img src={src} alt={alt + " full-size"} style={zoom === 1 ? { width: "100%", height: "100%", objectFit: "contain" } : { width: zoom * 100 + "%", height: "auto", maxWidth: "none", maxHeight: "none" }} /></div>
    <footer><p>{description}</p><div className="beer-lightbox-zoom" aria-label="Image zoom controls"><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))} disabled={zoom === 1} aria-label="Zoom out">−</button><output aria-live="polite">{zoom}×</output><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .5))} disabled={zoom === 3} aria-label="Zoom in">+</button></div><a href={src} target="_blank" rel="noreferrer">Open original</a></footer>
  </div>, document.body) : null;

  return <><button className="event-image-trigger" type="button" onClick={openViewer} aria-label={"View " + title + " picture full screen"}><img src={src} alt={alt} loading="lazy" /><span className="beer-image-expand" aria-hidden="true" data-tooltip="View full size">↗</span></button>{lightbox}</>;
}
