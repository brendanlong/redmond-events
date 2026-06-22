#!/usr/bin/env node
// Fetch configured .ics calendar sources, expand recurring events within a
// horizon, and print normalized upcoming events as JSON on stdout. The agent
// runs this, then applies editorial judgement and writes one article per event.
//
// Usage:
//   node scripts/fetch-ics.mjs                 # all type:ics entries in src/_data/sources.yaml
//   node scripts/fetch-ics.mjs <url> [<url>…]  # ad-hoc calendar URLs
//   node scripts/fetch-ics.mjs --days 90       # change the look-ahead horizon (default 45)
//   node scripts/fetch-ics.mjs --all           # include events already in state/seen.json
//
// Output: JSON array of { source, sourceUrl, region, tags, uid, recurring,
// allDay, title, start, end, location, url, description }. Times are ISO 8601 in
// America/Los_Angeles (date-only for all-day events). `uid` is the dedup key —
// for recurring events every occurrence shares one uid, so write a single article
// describing the series (see AGENT.md).
//
// By default, events whose `ics:<uid>` key already appears in state/seen.json are
// filtered out, so each run only surfaces calendar entries you haven't judged yet.
// A trailing summary line goes to stderr (e.g. "12 new, 47 already seen"). Pass
// --all to skip this filter and emit every event in the horizon.

import ICAL from "ical.js";
import { DateTime } from "luxon";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

const ZONE = "America/Los_Angeles";
const MAX_OCCURRENCES = 200; // guard against unbounded RRULEs

// --- args ---
const argv = process.argv.slice(2);
let days = 45;
let includeSeen = false;
const urlArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--days") days = Number(argv[++i]);
  else if (argv[i] === "--all") includeSeen = true;
  else urlArgs.push(argv[i]);
}

// --- seen ledger: skip ics:<uid> keys already judged (unless --all) ---
let seen = new Set();
if (!includeSeen) {
  try {
    const raw = await readFile(
      new URL("../state/seen.json", import.meta.url),
      "utf8"
    );
    seen = new Set(Object.keys(JSON.parse(raw).seen || {}));
  } catch (e) {
    process.stderr.write(`WARN: could not read state/seen.json: ${e.message}\n`);
  }
}

// --- source list: explicit URLs, or all type:ics entries from sources.yaml ---
let sources;
if (urlArgs.length) {
  sources = urlArgs.map((url) => ({ url }));
} else {
  const raw = await readFile(
    new URL("../src/_data/sources.yaml", import.meta.url),
    "utf8"
  );
  const cfg = parseYaml(raw) || {};
  sources = (cfg.sources || []).filter((s) => s.type === "ics" && s.url);
}

const now = DateTime.now().setZone(ZONE);
const rangeStartMs = now.minus({ days: 1 }).toMillis();
const rangeEndMs = now.plus({ days }).toMillis();

const toIso = (icalTime) => {
  const js = icalTime.toJSDate();
  return icalTime.isDate
    ? DateTime.fromJSDate(js, { zone: "utc" }).toISODate()
    : DateTime.fromJSDate(js).setZone(ZONE).toISO();
};

const out = [];

for (const src of sources) {
  let text;
  try {
    // webcal:// is just https:// for subscription URLs; fetch needs the http scheme.
    const fetchUrl = src.url.replace(/^webcal:\/\//i, "https://");
    const res = await fetch(fetchUrl, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    process.stderr.write(`WARN: fetch failed for ${src.url}: ${e.message}\n`);
    continue;
  }

  let comp;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch (e) {
    process.stderr.write(`WARN: parse failed for ${src.url}: ${e.message}\n`);
    continue;
  }

  // Register embedded VTIMEZONEs so TZID references resolve correctly.
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    const tzid = tz.getFirstPropertyValue("tzid");
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(
        tzid,
        new ICAL.Timezone({ component: tz, tzid })
      );
    }
  }

  const meta = {
    source: src.name || src.url,
    sourceUrl: src.url,
    region: src.region ?? null,
    tags: src.tags ?? [],
  };

  const emit = (startTime, endTime, recurring, ve, event) => {
    out.push({
      ...meta,
      uid: event.uid || null,
      recurring,
      allDay: startTime.isDate,
      title: event.summary || "(untitled)",
      start: toIso(startTime),
      end: endTime ? toIso(endTime) : null,
      location: event.location || null,
      url: ve.getFirstPropertyValue("url") || null,
      description: (event.description || "").slice(0, 500) || null,
    });
  };

  for (const ve of comp.getAllSubcomponents("vevent")) {
    let event;
    try {
      event = new ICAL.Event(ve);
    } catch {
      continue;
    }

    if (event.isRecurring()) {
      const it = event.iterator();
      let next;
      let guard = 0;
      while ((next = it.next()) && guard++ < MAX_OCCURRENCES) {
        let det;
        try {
          det = event.getOccurrenceDetails(next);
        } catch {
          continue;
        }
        const ms = det.startDate.toJSDate().getTime();
        if (ms > rangeEndMs) break;
        if (ms < rangeStartMs) continue;
        emit(det.startDate, det.endDate, true, ve, event);
      }
    } else {
      const s = event.startDate;
      if (!s) continue;
      const ms = s.toJSDate().getTime();
      if (ms >= rangeStartMs && ms <= rangeEndMs) {
        emit(event.startDate, event.endDate, false, ve, event);
      }
    }
  }
}

out.sort((a, b) => new Date(a.start) - new Date(b.start));

// Drop events already recorded in the seen ledger (keyed by ics:<uid>).
let skipped = 0;
const fresh = includeSeen
  ? out
  : out.filter((e) => {
      const isSeen = e.uid && seen.has(`ics:${e.uid}`);
      if (isSeen) skipped++;
      return !isSeen;
    });

if (!includeSeen) {
  process.stderr.write(`${fresh.length} new, ${skipped} already seen (pass --all to include seen)\n`);
}
process.stdout.write(JSON.stringify(fresh, null, 2) + "\n");
