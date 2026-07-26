"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Calendar, MapPin, Phone } from "@/components/icons";
import { orderFoodUrl, primaryNav } from "@/data/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Aviator Brewing Company home"><Image className="brand-logo" src="/images/aviator-logo.png" alt="" width={48} height={48} priority /> <span className="wordmark-copy">AVIATOR <b>BREWING CO.</b></span></Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {primaryNav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
      <div className="header-actions">
        <a className="button button-small button-order-food" href={orderFoodUrl} data-analytics="order_food_header">Order food <ArrowUpRight /></a><a className="text-action" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" data-analytics="directions_header" target="_blank" rel="noreferrer"><MapPin /> Directions</a>
        
      </div>
      <button className="mobile-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
        <span className="sr-only">{open ? "Close" : "Open"} menu</span><i /><i />
      </button>
      <div id="mobile-nav" className={`mobile-panel ${open ? "is-open" : ""}`}>
        <nav aria-label="Mobile navigation">{primaryNav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}</nav>
        <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="directions_mobile">Get directions <ArrowUpRight /></a>
      </div>
    </header>
    <nav className="mobile-action-bar" aria-label="Quick actions">
      <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="directions_mobile_bar"><MapPin />Directions</a>
      <a href={orderFoodUrl} data-analytics="order_food_mobile_bar"><span className="menu-glyph">+</span>Order Food</a>
      <Link href="/events" data-analytics="events_mobile_bar"><Calendar />Events</Link>
      <a href="tel:+19195672337" data-analytics="call_mobile_bar"><Phone />Call</a>
    </nav>
  </>;
}
