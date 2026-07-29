import type { BeerReleaseAlert } from "@/lib/beer-release-alert";

function releaseDateTime(alert: BeerReleaseAlert) {
  if (!alert.releaseDate && !alert.releaseTime) return "Release details coming soon";
  const date = alert.releaseDate ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(alert.releaseDate + "T12:00:00-05:00")) : "Date TBA";
  const time = alert.releaseTime ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, ...alert.releaseTime.split(":").map(Number) as [number, number])) : "Time TBA";
  return date + " at " + time;
}

function ReleaseAlertCard({ alert, index }: { alert: BeerReleaseAlert; index: number }) {
  const isPdf = alert.sellSheetUrl.toLowerCase().endsWith(".pdf");
  const titleId = "new-release-alert-title-" + index;
  return <div className="beer-release-alert-inner" aria-labelledby={titleId}><div className="beer-release-alert-copy"><p className="eyebrow">New Release Alert</p><h2 id={titleId}>{alert.beerName}</h2><dl><div><dt>Release</dt><dd>{releaseDateTime(alert)}</dd></div>{alert.locations ? <div><dt>Locations</dt><dd>{alert.locations}</dd></div> : null}{alert.specials ? <div><dt>Specials</dt><dd>{alert.specials}</dd></div> : null}</dl></div>{alert.sellSheetUrl ? <a className="beer-release-sell-sheet" href={alert.sellSheetUrl} target="_blank" rel="noreferrer" aria-label={"Open " + alert.beerName + " sell sheet full size"}>{isPdf ? <span><strong>Sell Sheet</strong><small>Open PDF full size</small></span> : <img src={alert.sellSheetUrl} alt={alert.beerName + " sell sheet"} loading="lazy" />}</a> : <div className="beer-release-sell-sheet beer-release-sell-sheet-empty"><span><strong>Sell Sheet</strong><small>Upload in manager portal</small></span></div>}</div>;
}

export function BeerReleaseAlertBand({ alerts }: { alerts: BeerReleaseAlert[] }) {
  const published = alerts.filter((alert) => alert.enabled && alert.beerName);
  if (!published.length) return null;
  return <section className="beer-release-alert" aria-label="New release alerts">{published.map((alert, index) => <ReleaseAlertCard alert={alert} index={index} key={alert.id || alert.beerName + index} />)}</section>;
}
