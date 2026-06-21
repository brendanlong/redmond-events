# SETUP.md — wiring up the daily routine

This repo is the *content + build*. To make it self-updating you need two things
outside the repo: a **Lion Reader account** for the agent to read from, and a
**daily Claude routine** that runs [`AGENT.md`](AGENT.md) and pushes. This file is
the one-time checklist for both.

> The agent only needs read access to Lion Reader and write access to this repo.
> **No credentials live in this repo** — it's public. Keep all secrets in the
> routine/MCP config.

---

## 1. Lion Reader (the agent's eyes)

Use a **dedicated Lion Reader account**, separate from your personal one — the
agent marks things read as it processes them, so you don't want it churning your
own unread counts.

1. Create the account and generate an **MCP API key** for it.
2. **Subscribe to sources** in the Lion Reader web UI (the read-only MCP can't add
   subscriptions yet):
   - RSS feeds — e.g. the **Gearhouse** event schedule, Redmond/Eastside city and
     parks calendars, venue feeds, local blogs.
   - **Email newsletters** — grab the account's newsletter inbox address from Lion
     Reader and subscribe to local newsletters with it.
   - Tag feeds (e.g. `events`, `music`, `outdoors`) if you want the agent to filter
     by source category later.
3. *(Optional, when ready)* Add the **subscribe/unsubscribe MCP tools** so the agent
   can manage its own feeds. Until then, feed management is manual here.

What the agent does with it each run: `list_entries({ unreadOnly: true })` →
`get_entry` for detail → `mark_entries_read` once processed. That's the whole
read/cursor loop (see `AGENT.md`).

---

## 2. The daily routine

Set up a Claude routine (cloud agent on a schedule) with:

**Schedule:** daily at **6:00 AM America/Los_Angeles**.
- Cron (if the runner is in PT): `0 6 * * *`
- Cron (if the runner is in UTC): `0 13 * * *` during PDT / `0 14 * * *` during PST

**Working repo:** `brendanlong/redmond-events`, branch `main`, with **write/push**
access (a deploy token or the routine's GitHub auth). Pushing to `main` triggers the
deploy workflow automatically.

**MCP servers to attach:** the **Lion Reader** MCP, authenticated with the agent
account's API key.

**Tools/permissions the routine needs:**
- Lion Reader MCP (read + `mark_entries_read`)
- Shell for `npm ci` / `npm run build`
- `git commit` + `git push` to `main`

**Routine prompt** (keep it thin — the real instructions live in `AGENT.md`):

```
You are the Near Redmond events reporter. Work in the brendanlong/redmond-events
repo on the main branch. Follow AGENT.md in the repo exactly for today's run:
read unread entries from the Lion Reader MCP, filter by interest and distance per
src/_data/profile.yaml, write one Markdown article per worthwhile event into
src/events/, mark the source entries read, then run `npm run build`. Only if the
build succeeds, commit and push to main. If nothing is worth publishing, make no
commit. Never commit secrets.
```

That's deliberately minimal so editorial rules stay version-controlled in
`AGENT.md`/`profile.yaml` and you tune them with normal commits, not by editing the
routine.

---

## 3. First run & verification

1. **Dry run first:** run the routine once manually (or run `AGENT.md`'s steps by
   hand) before enabling the schedule, and check the diff it produces.
2. Confirm `npm run build` passes locally/in the run — that's the only deploy gate.
3. After it pushes, watch the **Deploy** workflow (Actions tab) go green and check
   the live site: https://brendanlong.github.io/redmond-events/
4. Delete the seed example event (`src/events/2026-06-27-redmond-saturday-market.md`)
   once real events are landing — `AGENT.md` reminds the agent to do this.

## 4. Maintenance

- **Tune taste/range:** edit [`src/_data/profile.yaml`](src/_data/profile.yaml).
- **Tune process/voice:** edit [`AGENT.md`](AGENT.md).
- **Add/remove sources:** in the Lion Reader account (or via the subscribe MCP tools
  once added).
- **If a build ever fails:** Pages keeps serving the last good version, so a bad run
  is non-destructive — fix forward in the next run or a manual commit.
