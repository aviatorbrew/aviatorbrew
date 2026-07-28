"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";

export function HomeLogoViewer() {
  const [open, setOpen] = useState(false);
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

  return <>
    <button className="home-logo-trigger" type="button" onClick={() => setOpen(true)} aria-label="View Aviator logo full screen">
      <BrandLogo className="home-brand-logo" />
      <span className="home-logo-expand" aria-hidden="true" data-tooltip="View full size">↗</span>
    </button>
    {open ? createPortal(<div className="home-logo-lightbox" role="dialog" aria-modal="true" aria-label="Aviator Brewing Company logo" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <button ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close full-screen logo">×</button>
      <BrandLogo className="home-logo-full-size" />
    </div>, document.body) : null}
  </>;
}
