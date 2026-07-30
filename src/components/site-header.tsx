"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Calendar, MapPin, Phone } from "@/components/icons";
import { BrandLogo } from "@/components/brand-logo";
import { orderFoodUrl, primaryNav } from "@/data/site";

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

export function SiteHeader() {
  const pathname = normalizePath(usePathname() || "/");
  const navRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  useEffect(() => {
    function closeForOutsidePointer(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenMenu(null);
    }

    function closeForEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileExpanded(null);
      }
    }

    document.addEventListener("pointerdown", closeForOutsidePointer);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("pointerdown", closeForOutsidePointer);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, []);

  function isLinkActive(href: string) {
    const itemPath = normalizePath(href);
    if (itemPath === "/events") return pathname === "/events" || (pathname.startsWith("/events/") && pathname !== "/events/live-music");
    return pathname === itemPath || (itemPath !== "/" && pathname.startsWith(itemPath + "/"));
  }

  function isNavActive(item: (typeof primaryNav)[number]) {
    return isLinkActive(item.href) || Boolean(item.children?.some((child) => isLinkActive(child.href)));
  }

  function focusFirstSubmenuLink(menuHref: string) {
    window.requestAnimationFrame(() => {
      const firstLink = navRef.current?.querySelector<HTMLAnchorElement>(`[data-submenu="${menuHref}"] a`);
      firstLink?.focus();
    });
  }

  function handleDesktopTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>, href: string) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpenMenu(href);
      focusFirstSubmenuLink(href);
    }
  }

  function closeMobile() {
    setOpen(false);
    setMobileExpanded(null);
  }

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Aviator Brewing Company home"><BrandLogo className="brand-logo" decorative /> <span className="wordmark-copy">AVIATOR <b>BREWING CO.</b></span></Link>
      <nav className="desktop-nav" aria-label="Primary navigation" ref={navRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null); }}>
        {primaryNav.map((item) => {
          const active = isNavActive(item);
          if (item.children?.length) return <div className={"desktop-nav-item has-submenu" + (active ? " is-active" : "") + (("featured" in item && item.featured) ? " is-featured" : "")} key={item.href} onMouseEnter={() => setOpenMenu(item.href)} onMouseLeave={() => setOpenMenu(null)}>
            <button className={"desktop-nav-trigger" + (active ? " is-active" : "")} type="button" aria-haspopup="menu" aria-expanded={openMenu === item.href} aria-controls={"desktop-submenu-" + item.href.replace(/[^a-z0-9]/gi, "-")} onClick={() => setOpenMenu(openMenu === item.href ? null : item.href)} onKeyDown={(event) => handleDesktopTriggerKeyDown(event, item.href)}>
              {item.label}<span aria-hidden="true">▾</span>
            </button>
            <div className="desktop-submenu" id={"desktop-submenu-" + item.href.replace(/[^a-z0-9]/gi, "-")} role="menu" data-open={openMenu === item.href ? "true" : undefined} data-submenu={item.href}>
              {item.children.map((child) => {
                const childActive = isLinkActive(child.href);
                return <Link className={childActive ? "is-active" : undefined} href={child.href} key={child.href} role="menuitem" aria-current={childActive ? "page" : undefined} onClick={() => setOpenMenu(null)}>{child.label}</Link>;
              })}
            </div>
          </div>;

          return <div className={"desktop-nav-item" + (active ? " is-active" : "") + (("featured" in item && item.featured) ? " is-featured" : "")} key={item.href}>
            <Link className={(active ? "is-active" : "") + (("featured" in item && item.featured) ? " is-featured" : "") || undefined} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>
          </div>;
        })}
      </nav>
      <div className="header-actions">
        <a className="button button-small button-order-food" href={orderFoodUrl} data-analytics="order_food_header">Order food <ArrowUpRight /></a>
        <Link className="text-action header-newsletter-link" href="/#updates" data-analytics="newsletter_header">Flight Crew</Link>
        <a className="text-action" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" data-analytics="directions_header" target="_blank" rel="noreferrer"><MapPin /> Directions</a>
      </div>
      <button className="mobile-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
        <span className="sr-only">{open ? "Close" : "Open"} menu</span><i /><i />
      </button>
      <div id="mobile-nav" className={`mobile-panel ${open ? "is-open" : ""}`}>
        <nav aria-label="Mobile navigation">
          {primaryNav.map((item) => {
            const active = isNavActive(item);
            if (item.children?.length) return <div className="mobile-nav-group" key={item.href}>
              <button className={"mobile-nav-trigger" + (active ? " is-active" : "") + (("featured" in item && item.featured) ? " is-featured" : "")} type="button" aria-expanded={mobileExpanded === item.href} aria-controls={"mobile-submenu-" + item.href.replace(/[^a-z0-9]/gi, "-")} onClick={() => setMobileExpanded(mobileExpanded === item.href ? null : item.href)}>
                {item.label}<span aria-hidden="true">▾</span>
              </button>
              <div className="mobile-submenu" id={"mobile-submenu-" + item.href.replace(/[^a-z0-9]/gi, "-")} hidden={mobileExpanded !== item.href}>
                {item.children.map((child) => {
                  const childActive = isLinkActive(child.href);
                  return <Link className={"mobile-submenu-link" + (childActive ? " is-active" : "")} href={child.href} aria-current={childActive ? "page" : undefined} onClick={closeMobile} key={child.href}>{child.label}</Link>;
                })}
              </div>
            </div>;

            return <div className="mobile-nav-group" key={item.href}>
              <Link className={active ? "is-active" : undefined} href={item.href} aria-current={active ? "page" : undefined} onClick={closeMobile}>{item.label}</Link>
            </div>;
          })}
          <Link href="/#updates" onClick={closeMobile}>Join the Flight Crew</Link>
        </nav>
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
