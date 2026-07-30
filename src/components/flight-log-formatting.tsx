import type { ReactNode } from "react";

function stripMarkdownLink(value: string) {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function cleanLine(value: string) {
  return stripMarkdownLink(value).replace(/<[^>]+>/g, "").trim();
}

function paragraphKey(lines: string[], index: number) {
  return lines.join("|").slice(0, 80) + "-" + index;
}

export function FlightLogFormattedBody({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const text = paragraph.map(cleanLine).filter(Boolean).join(" ");
    if (text) blocks.push(<p key={paragraphKey(paragraph, blocks.length)}>{text}</p>);
    paragraph = [];
  }

  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(<ul key={"ul-" + blocks.length}>{bullets.map((item, index) => <li key={index}>{cleanLine(item)}</li>)}</ul>);
    bullets = [];
  }

  function flushNumbers() {
    if (!numbers.length) return;
    blocks.push(<ol key={"ol-" + blocks.length}>{numbers.map((item, index) => <li key={index}>{cleanLine(item)}</li>)}</ol>);
    numbers = [];
  }

  function flushAll() { flushParagraph(); flushBullets(); flushNumbers(); }

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushAll(); return; }
    if (line.startsWith("### ")) { flushAll(); blocks.push(<h4 key={"h4-" + blocks.length}>{cleanLine(line.slice(4))}</h4>); return; }
    if (line.startsWith("## ")) { flushAll(); blocks.push(<h3 key={"h3-" + blocks.length}>{cleanLine(line.slice(3))}</h3>); return; }
    if (line.startsWith("# ")) { flushAll(); blocks.push(<h2 key={"h2-" + blocks.length}>{cleanLine(line.slice(2))}</h2>); return; }
    if (line.startsWith("> ")) { flushAll(); blocks.push(<blockquote key={"quote-" + blocks.length}>{cleanLine(line.slice(2))}</blockquote>); return; }
    if (/^[-*]\s+/.test(line)) { flushParagraph(); flushNumbers(); bullets.push(line.replace(/^[-*]\s+/, "")); return; }
    if (/^\d+[.)]\s+/.test(line)) { flushParagraph(); flushBullets(); numbers.push(line.replace(/^\d+[.)]\s+/, "")); return; }
    flushBullets(); flushNumbers(); paragraph.push(line);
  });
  flushAll();
  return <>{blocks}</>;
}
