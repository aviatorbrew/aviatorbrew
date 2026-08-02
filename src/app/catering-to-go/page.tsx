import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MapPin, Phone } from "@/components/icons";
import { CateringOrderForm } from "@/components/catering-order-form";
import { getCateringMenuScan } from "@/lib/catering-menu-scanner";
import { getLocation } from "@/lib/managed-locations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catering To Go | Aviator Brewing Company",
  description: "Browse the Aviator Catering To Go menu, pickup details at Aviator Hangar Bar, and contact the events team for catering orders in Fuquay-Varina.",
};

type MenuFile = { name: string; url: string } | null;

async function latestMenu(location: string, type: "food" | "drinks"): Promise<MenuFile> {
  const directory = path.join(process.cwd(), "public", "media", "menus", location, type);
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const candidates = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => ({ name: entry.name, stats: await fs.stat(path.join(directory, entry.name)) })));
    candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
    const current = candidates[0];
    return current ? { name: current.name, url: "/media/menus/" + location + "/" + type + "/" + encodeURIComponent(current.name) } : null;
  } catch { return null; }
}

function cleanMenuName(name: string) {
  return name.replace(/^\d+-/, "").replace(/[_-]+/g, " ").replace(/\.pdf$/i, "");
}

export default async function CateringToGoPage() {
  const [menu, backupMenu, hangar, menuScan] = await Promise.all([latestMenu("catering-events", "drinks"), latestMenu("catering-events", "food"), getLocation("hangar-bar"), getCateringMenuScan()]);
  const menuFile = menu || backupMenu || (menuScan.menuUrl ? { name: menuScan.menuName, url: menuScan.menuUrl } : null);
  const pickupAddress = hangar?.address || "688 Brewing Drive, Fuquay-Varina, NC 27526";
  const pickupPhone = hangar?.phone || "919-567-2337";
  const pickupHours = hangar?.hours || "Open daily at the brewery campus";

  return <main>
    <section className="catering-hero"><div className="content-wrap catering-hero-inner"><div><p className="eyebrow">Private events flight line</p><h1>Catering To Go</h1><p>Bring Aviator food to the office, tailgate, rehearsal dinner, birthday, family gathering, or crew lunch. Browse the current pickup catering menu, send us the details, and the Aviator events team will confirm availability, timing, and pickup instructions.</p><div className="hero-actions"><Link className="button" href="#catering-request" data-analytics="catering_returning_enter_order">Returning? Enter order <ArrowUpRight /></Link>{menuFile ? <a className="button" href={menuFile.url} target="_blank" rel="noreferrer" data-analytics="catering_to_go_menu">View Catering To Go menu <ArrowUpRight /></a> : <Link className="button" href="#catering-request">Request menu help <ArrowUpRight /></Link>}<Link className="button button-outline" href="/private-events">Private Events</Link></div></div><aside><span>Pickup HQ</span><strong>Aviator Hangar Bar</strong><p>{pickupAddress}</p></aside></div></section>

    <section className="section catering-command-section"><div className="content-wrap catering-command-grid"><article className="catering-menu-panel"><p className="eyebrow">Current menu</p><h2>Start with the pickup menu.</h2><p>The Catering To Go menu is the fastest way to plan party trays, shareable food, and group pickup orders from Aviator.</p>{menuFile ? <a className="catering-menu-download" href={menuFile.url} target="_blank" rel="noreferrer"><strong>Open menu</strong><span>{cleanMenuName(menuFile.name)}</span><ArrowUpRight /></a> : <div className="catering-menu-download is-pending"><strong>Menu upload pending</strong><span>Use the form and the events team will send the latest menu.</span></div>}</article><article className="catering-pickup-panel"><p className="eyebrow">Pickup location</p><h2>Aviator Hangar Bar</h2><p><MapPin /> {pickupAddress}</p><p><Phone /> {pickupPhone}</p><p><strong>Hours</strong><br />{pickupHours}</p><p>Pickup is at the brewery campus Hangar Bar unless the events team confirms a different arrangement. Ask for the order under your confirmed pickup name.</p></article></div></section>

    <section className="section section-dark catering-steps-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">How it works</p><h2>File the flight plan.</h2></div><p>The form does not lock in an order by itself. The Aviator events team will review your request and confirm menu availability, pickup time, and any payment details.</p></div><div className="catering-steps"><article><span>01</span><h3>Open the menu</h3><p>Pick the items, quantities, and any notes for your group.</p></article><article><span>02</span><h3>Send the request</h3><p>Tell us the pickup date, preferred pickup time, guest count, and order details.</p></article><article><span>03</span><h3>Wait for confirmation</h3><p>We will confirm availability and pickup instructions before the order is final.</p></article></div></div></section>

    <section id="catering-request" className="section catering-request-section"><div className="content-wrap catering-request-grid"><div><p className="eyebrow">Contact events</p><h2>Request Catering To Go.</h2><p>Send this form to the Aviator events team at <a href="mailto:events@aviatorbrew.com">events@aviatorbrew.com</a>. Include your pickup date, time, guest count, and the menu items you are considering.</p><dl><div><dt>Pickup</dt><dd>Aviator Hangar Bar</dd></div><div><dt>Address</dt><dd>{pickupAddress}</dd></div><div><dt>Best for</dt><dd>Office lunches, parties, meetings, birthdays, tailgates, and casual group orders.</dd></div></dl></div><div className="catering-form-card"><CateringOrderForm items={menuScan.items} menuUrl={menuFile?.url} scanSource={menuScan.source} /></div></div></section>
  </main>;
}

