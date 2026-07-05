import { DateTime } from "luxon";

const ZONE = "America/Los_Angeles";
// Convert to a luxon DateTime, throwing on invalid input. Luxon otherwise renders
// "Invalid DateTime" for a missing/bad value (e.g. a template reading `start` on a
// `dates:`-only event), silently shipping that string to the page. Throwing turns
// it into a build failure — `name` identifies which filter/value was at fault.
const toDT = (d, name = "date") => {
  const dt = DateTime.fromJSDate(new Date(d));
  if (!dt.isValid)
    throw new Error(
      `${name} filter got an invalid date: ${JSON.stringify(d)} (${dt.invalidReason || "not a date"})`
    );
  return dt;
};

// Normalize an event's timing into a list of { start, end } occurrences. Supports
// a single event (top-level start/end) and multi-day events (a `dates:` list).
const occurrencesOf = (data = {}) => {
  if (Array.isArray(data.dates) && data.dates.length) {
    return data.dates.map((o) => ({ start: o.start, end: o.end || null }));
  }
  if (data.start) return [{ start: data.start, end: data.end || null }];
  return [];
};
const firstStartOf = (data) => {
  const occ = occurrencesOf(data);
  return occ.length
    ? occ.reduce((m, o) => (new Date(o.start) < new Date(m) ? o.start : m), occ[0].start)
    : null;
};
const lastEndOf = (data) => {
  const occ = occurrencesOf(data);
  if (!occ.length) return null;
  return occ.reduce((m, o) => {
    const e = o.end || o.start;
    return new Date(e) > new Date(m) ? e : m;
  }, occ[0].end || occ[0].start);
};

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Every event article, sorted by first start time (used for the calendar +
  // listings). `firstStart` is computed (see events.11tydata.js) so multi-day
  // events sort by their opening day.
  eleventyConfig.addCollection("events", (api) =>
    api
      .getFilteredByGlob("./src/events/*.md")
      .sort((a, b) => new Date(firstStartOf(a.data)) - new Date(firstStartOf(b.data)))
  );

  // Same files, sorted by publish date (used for the RSS feed + "recently posted").
  eleventyConfig.addCollection("articles", (api) =>
    api
      .getFilteredByGlob("./src/events/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  );

  // --- date formatting ---
  eleventyConfig.addFilter("readable", (d) =>
    toDT(d, "readable").setZone(ZONE).toFormat("EEEE, LLLL d, yyyy 'at' h:mm a")
  );
  eleventyConfig.addFilter("readableDay", (d) =>
    toDT(d, "readableDay").setZone(ZONE).toFormat("EEEE, LLLL d")
  );
  // Publish dates are written date-only (midnight UTC); render them in UTC so they
  // don't slip to the previous day in Pacific time.
  eleventyConfig.addFilter("pubDay", (d) => toDT(d, "pubDay").toUTC().toFormat("LLLL d, yyyy"));
  eleventyConfig.addFilter("isoDate", (d) => toDT(d, "isoDate").toISO());
  eleventyConfig.addFilter("rfc822", (d) => toDT(d, "rfc822").toRFC2822());
  eleventyConfig.addFilter("icsDate", (d) =>
    toDT(d, "icsDate").toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")
  );

  // --- helpers ---
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("occurrences", occurrencesOf);
  eleventyConfig.addFilter("firstStart", firstStartOf);
  eleventyConfig.addFilter("upcoming", (events) => {
    const now = Date.now();
    return (events || []).filter(
      (e) => new Date(lastEndOf(e.data) || firstStartOf(e.data)).getTime() >= now
    );
  });
  // RFC 5545 text escaping for .ics fields.
  eleventyConfig.addFilter("icsText", (s) =>
    String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n")
  );

  return {
    pathPrefix: "/redmond-events/",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
