// Copyright 2026 The Racial Equity Institute. All rights reserved.
//
// normalize.mjs — best-effort scraper for https://www.racialequityinstitute.org/trainings
//
// The trainings page is a hand-edited Squarespace page; ?format=json returns the page
// collection with text blocks containing event cards (title/date/format text) and
// outbound registration links (luma.com, buy.stripe.com, eventbrite.com,
// lp.constantcontactpages.com, 3rdspaceactionlab.co).
//
// Strategy: parse the Squarespace JSON, extract anchor hrefs that match known
// registration hosts plus the surrounding text, and normalize into the events.json
// schema. On ANY parse failure or implausible output (zero events), keep the existing
// events.json untouched and exit 2 so the workflow can open an issue instead of
// committing bad data.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SOURCE = "https://www.racialequityinstitute.org/trainings?format=json";
const OUT = new URL("../events.json", import.meta.url).pathname;
const MANIFEST = new URL("../manifest.json", import.meta.url).pathname;

const REG_HOSTS = [
  ["luma.com", "luma"], ["lu.ma", "luma"],
  ["buy.stripe.com", "stripe"],
  ["eventbrite.com", "eventbrite"],
  ["lp.constantcontactpages.com", "constantcontact"],
  ["3rdspaceactionlab.co", "thirdspace"],
];

const MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12 };

function stripHtml(s) { return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

function classify(title) {
  const t = title.toLowerCase();
  if (t.includes("phase 2") || t.includes("phase ii")) return "phase2";
  if (t.includes("phase 1") || t.includes("phase i")) return "phase1";
  if (t.includes("groundwater")) return "groundwater";
  if (t.includes("conference") || t.includes("paradox")) return "conference";
  if (t.includes("youth")) return "youth";
  if (t.includes("latin")) return "latinx";
  if (t.includes("debrief")) return "debrief";
  if (t.includes("pre-brief") || t.includes("prebrief")) return "prebrief";
  return "other";
}

// Best-effort "Month D[–D][, YYYY]" extraction near the title text.
function parseDates(text, fallbackYear) {
  const m = text.match(/([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*[–\-—&]+\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2}))?(?:,?\s*(\d{4}))?/);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  const year = m[5] ? +m[5] : fallbackYear;
  const d2mon = m[3] ? MONTHS[m[3].toLowerCase()] || mon : mon;
  const pad = (n) => String(n).padStart(2, "0");
  const start = `${year}-${pad(mon)}-${pad(+m[2])}`;
  const end = m[4] ? `${year}-${pad(d2mon)}-${pad(+m[4])}` : start;
  return { start, end };
}

function hostFor(url, text) {
  const t = text.toLowerCase();
  if (t.includes("partnership project")) return "The Partnership Project";
  if (t.includes("cara")) return "CARA";
  if (url.includes("3rdspaceactionlab")) return "Third Space Action Lab";
  if (url.includes("buy.stripe.com")) return "REI";
  return "REI / partner";
}

async function main() {
  const res = await fetch(SOURCE, { headers: { "User-Agent": "REI-App-Data sync bot" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const page = await res.json();
  const html = JSON.stringify(page); // search all block content
  const year = new Date().getFullYear();

  const events = [];
  const seen = new Set();
  // Find anchors to known registration hosts with up to ~400 chars of preceding context.
  const re = /([\s\S]{0,400}?)<a[^>]+href=\\?"(https?:\/\/[^"\\]+)\\?"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = m[2];
    const hostEntry = REG_HOSTS.find(([h]) => url.includes(h));
    if (!hostEntry) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const ctx = stripHtml(m[1]);
    // Title heuristic: last sentence-ish chunk containing workshop keywords, else trailing context.
    const titleMatch = ctx.match(/([A-Z][^.!?]*?(Phase\s*[12I]+|Groundwater|Workshop|Conference|Presentation)[^.!?]*)/i);
    const title = (titleMatch ? titleMatch[1] : ctx.slice(-120)).trim();
    if (!title) continue;
    const dates = parseDates(ctx, year);
    const virtual = /virtual|online|zoom/i.test(ctx);
    events.push({
      id: `${dates ? dates.start : "tbd"}-${classify(title)}-${url.slice(-8).replace(/\W/g, "")}`,
      title,
      type: classify(title),
      dateStart: dates ? dates.start : null,
      dateEnd: dates ? dates.end : null,
      format: virtual ? "virtual" : "inPerson",
      city: virtual ? null : (/greensboro/i.test(ctx) ? "Greensboro, NC" : (/los angeles/i.test(ctx) ? "Los Angeles, CA" : null)),
      venue: null,
      timeText: (ctx.match(/\d{1,2}(:\d{2})?\s*(am|pm)[^.]{0,40}/i) || [null])[0],
      priceText: "See registration page",
      registrationUrl: url,
      host: hostFor(url, ctx),
      sourceSystem: hostEntry[1],
    });
  }

  if (events.length === 0) throw new Error("parsed zero events — keeping existing events.json");

  const now = new Date().toISOString();
  const out = { schemaVersion: 1, updatedAt: now, events: events.filter(e => e.dateStart) };
  if (out.events.length === 0) throw new Error("no dated events parsed — keeping existing events.json");

  // Only rewrite if materially different (ignore updatedAt).
  let existing = null;
  try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
  const key = (o) => JSON.stringify(o.events);
  if (existing && key(existing) === key(out)) { console.log("no changes"); return; }

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  manifest.updatedAt = now;
  // Recompute sha256 + bump updatedAt for the changed file(s) so the app's
  // integrity gate stays valid. Always re-hash every file from disk.
  const dir = new URL("../", import.meta.url).pathname;
  for (const f of manifest.files) {
    const bytes = readFileSync(dir + f.id + ".json");
    const newHash = createHash("sha256").update(bytes).digest("hex");
    if (f.id === "events") f.updatedAt = now;       // only events was re-scraped
    f.sha256 = newHash;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${out.events.length} events`);
}

main().catch((e) => { console.error("normalize failed:", e.message); process.exit(2); });
