import { DateTime } from "luxon";

const ZONE = "America/Los_Angeles";
const toDT = (d) => DateTime.fromJSDate(new Date(d));

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Every event article, sorted by start time (used for the calendar + listings).
  eleventyConfig.addCollection("events", (api) =>
    api
      .getFilteredByGlob("./src/events/*.md")
      .sort((a, b) => new Date(a.data.start) - new Date(b.data.start))
  );

  // Same files, sorted by publish date (used for the RSS feed + "recently posted").
  eleventyConfig.addCollection("articles", (api) =>
    api
      .getFilteredByGlob("./src/events/*.md")
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  );

  // --- date formatting ---
  eleventyConfig.addFilter("readable", (d) =>
    toDT(d).setZone(ZONE).toFormat("EEEE, LLLL d, yyyy 'at' h:mm a")
  );
  eleventyConfig.addFilter("readableDay", (d) =>
    toDT(d).setZone(ZONE).toFormat("EEEE, LLLL d")
  );
  // Publish dates are written date-only (midnight UTC); render them in UTC so they
  // don't slip to the previous day in Pacific time.
  eleventyConfig.addFilter("pubDay", (d) => toDT(d).toUTC().toFormat("LLLL d, yyyy"));
  eleventyConfig.addFilter("isoDate", (d) => toDT(d).toISO());
  eleventyConfig.addFilter("rfc822", (d) => toDT(d).toRFC2822());
  eleventyConfig.addFilter("icsDate", (d) =>
    toDT(d).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")
  );

  // --- helpers ---
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("upcoming", (events) => {
    const now = Date.now();
    return (events || []).filter(
      (e) => new Date(e.data.end || e.data.start).getTime() >= now
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
