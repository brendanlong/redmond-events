#!/usr/bin/env node
// Lint the time fields in event articles (src/events/*.md). The build itself is
// forgiving — a bad time silently produces a zero-duration calendar entry or
// sorts wrong — so this catches the mistakes the build won't.
//
// Usage:
//   node scripts/lint-events.mjs            # lint src/events/*.md
//   npm run lint:events
//
// Rules (see AGENT.md "File format" and eleventy.config.js `occurrencesOf`):
//   ERROR — fails the lint (exit 1):
//     • no timing at all (neither `start` nor a non-empty `dates:` list)
//     • both a top-level `start` and a `dates:` list (the build ignores
//       start/end when `dates` is present — a silent footgun)
//     • `dates:` present but empty or an entry missing `start`
//     • a time that isn't a valid ISO 8601 datetime
//     • a time without an explicit Pacific offset, or with the wrong one for the
//       date (must be -07:00 during PDT / -08:00 during PST)
//     • `end` not strictly after `start`
//   WARN — printed, does not fail:
//     • a single event with no `end` (calendar entry has zero duration)
//     • the filename date prefix not matching the first occurrence's start date

import { readdir, readFile } from "node:fs/promises";
import { DateTime } from "luxon";
import { parse as parseYaml } from "yaml";

const ZONE = "America/Los_Angeles";
const DIR = new URL("../src/events/", import.meta.url);
const OFFSET_RE = /[+-]\d{2}:\d{2}$/; // trailing numeric offset, e.g. -07:00

const problems = []; // { file, level: "error"|"warn", field, msg }
const add = (file, level, field, msg) => problems.push({ file, level, field, msg });

// Pull the YAML frontmatter out of a Markdown file.
function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? parseYaml(m[1]) : null;
}

// Validate a single datetime string for `file`/`field`. Returns a luxon DateTime
// (with its literal offset preserved) when usable, else null.
function checkDateTime(file, field, value) {
  if (typeof value !== "string") {
    add(file, "error", field, `expected an ISO 8601 datetime string, got ${typeof value}`);
    return null;
  }
  if (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) === false) {
    add(
      file,
      "error",
      field,
      `"${value}" is missing a Pacific timezone offset (use -07:00 for PDT, -08:00 for PST)`
    );
    return null;
  }
  const dt = DateTime.fromISO(value, { setZone: true });
  if (!dt.isValid) {
    add(file, "error", field, `"${value}" is not a valid datetime (${dt.invalidReason})`);
    return null;
  }
  // The literal offset must be the correct Pacific offset for that instant.
  const correct = dt.setZone(ZONE).offset;
  if (dt.offset !== correct) {
    const want = correct === -420 ? "-07:00" : "-08:00";
    add(
      file,
      "error",
      field,
      `"${value}" has the wrong offset for that date — Pacific time is ${want} then`
    );
  }
  return dt;
}

// Validate one { start, end } occurrence; `label` distinguishes dates[] entries.
function checkOccurrence(file, occ, label, { warnMissingEnd }) {
  const start = checkDateTime(file, `${label}.start`, occ.start);
  if (occ.end == null) {
    if (warnMissingEnd)
      add(file, "warn", `${label}.end`, "no end time — calendar entry will have zero duration");
    return start;
  }
  const end = checkDateTime(file, `${label}.end`, occ.end);
  if (start && end && end <= start)
    add(file, "error", `${label}.end`, `end (${occ.end}) is not after start (${occ.start})`);
  return start;
}

const files = (await readdir(DIR)).filter((f) => f.endsWith(".md")).sort();

for (const file of files) {
  const data = frontmatter(await readFile(new URL(file, DIR), "utf8"));
  if (!data) {
    add(file, "error", "frontmatter", "could not parse YAML frontmatter");
    continue;
  }

  const hasDates = Array.isArray(data.dates) && data.dates.length > 0;
  const hasStart = data.start != null;

  if ("dates" in data && !hasDates)
    add(file, "error", "dates", "`dates` is present but empty — give it at least one entry");
  if (hasDates && (hasStart || data.end != null))
    add(file, "error", "dates", "has both `dates` and top-level `start`/`end`; the build uses `dates` and ignores start/end — pick one");
  if (!hasDates && !hasStart)
    add(file, "error", "start", "no timing: needs a top-level `start` or a `dates:` list");

  // Collect occurrences and validate each.
  let firstStart = null;
  if (hasDates) {
    data.dates.forEach((o, i) => {
      if (o == null || o.start == null) {
        add(file, "error", `dates[${i}]`, "missing `start`");
        return;
      }
      const s = checkOccurrence(file, o, `dates[${i}]`, { warnMissingEnd: true });
      if (s && (!firstStart || s < firstStart)) firstStart = s;
    });
  } else if (hasStart) {
    firstStart = checkOccurrence(file, { start: data.start, end: data.end }, "event", {
      warnMissingEnd: true,
    });
  }

  // Filename date prefix should match the first occurrence's (Pacific) start day.
  const m = file.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (m && firstStart) {
    const startDay = firstStart.setZone(ZONE).toFormat("yyyy-MM-dd");
    if (m[1] !== startDay)
      add(file, "warn", "filename", `date prefix ${m[1]} doesn't match first start date ${startDay}`);
  }
}

// --- report ---
const errors = problems.filter((p) => p.level === "error");
const warns = problems.filter((p) => p.level === "warn");

for (const p of problems) {
  const tag = p.level === "error" ? "ERROR" : "warn ";
  console[p.level === "error" ? "error" : "log"](`${tag} ${p.file} [${p.field}] ${p.msg}`);
}

const summary = `Linted ${files.length} event file(s): ${errors.length} error(s), ${warns.length} warning(s).`;
if (errors.length) {
  console.error(`\n${summary}`);
  process.exit(1);
}
console.log(warns.length ? `\n${summary}` : `${summary} All good.`);
