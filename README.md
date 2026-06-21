# redmond-events

A hyper-local, AI-written newsletter of events near **downtown Redmond, WA**.

An AI agent reads local feeds and email newsletters (via a [Lion Reader](https://lionreader.com)
account), decides what's worth knowing about for readers who live ~20 minutes'
walk from downtown Redmond, and files one short report per event. The site is a
static [Eleventy](https://www.11ty.dev/) build published to GitHub Pages, with an
RSS feed and a subscribable calendar.

- **Site:** https://brendanlong.github.io/redmond-events/
- **RSS:** https://brendanlong.github.io/redmond-events/feed.xml
- **Calendar:** `webcal://brendanlong.github.io/redmond-events/events.ics`

## How it works

- Each event is one Markdown file in [`src/events/`](src/events/) with structured
  frontmatter (time, real street address, region, tags) and a reporter-style
  write-up in the body.
- The build generates the website, the RSS feed (`/feed.xml`), and the calendar
  (`/events.ics`) from those files — one source of truth.
- A daily [Claude](https://claude.com/claude-code) routine follows
  [`AGENT.md`](AGENT.md): read Lion Reader → filter for relevance and distance →
  write one article per event → build → push. GitHub Actions deploys to Pages.

## Running it

[`SETUP.md`](SETUP.md) is the one-time checklist for wiring up the Lion Reader
account and the daily routine that keeps the site updated.

## Editorial config

Interests and how far readers will travel live in
[`src/_data/profile.yaml`](src/_data/profile.yaml). Edit that to retune taste and
range. Process rules live in [`AGENT.md`](AGENT.md).

## Develop locally

```bash
npm install
npm run serve   # local preview with live reload
npm run build   # production build into _site/
```

The deploy gate is simply that `npm run build` succeeds.
