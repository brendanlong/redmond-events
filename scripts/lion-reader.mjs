#!/usr/bin/env node
// Call the Lion Reader MCP server directly over HTTP, for runs where the Lion
// Reader MCP isn't wired into the session. The hosted MCP endpoint is a plain
// Streamable-HTTP JSON-RPC server, so this is a thin `tools/call` (and
// `tools/list`) client — no MCP client library needed.
//
// Auth comes from the environment, never the repo:
//   export LION_READER_TOKEN=…      # the agent account's MCP API token
// (LR_TOKEN is also accepted.) Override the endpoint with LION_READER_MCP_URL.
//
// Usage:
//   node scripts/lion-reader.mjs tools                       # list available tools
//   node scripts/lion-reader.mjs <tool> '<json-args>'        # call a tool
//
// Examples (the daily read/cursor loop from AGENT.md):
//   node scripts/lion-reader.mjs count_entries  '{"unreadOnly":true}'
//   node scripts/lion-reader.mjs list_entries   '{"unreadOnly":true,"limit":50}'
//   node scripts/lion-reader.mjs list_entries   '{"unreadOnly":true,"cursor":"<nextCursor>"}'
//   node scripts/lion-reader.mjs get_entry      '{"entryId":"<id>"}'
//   node scripts/lion-reader.mjs mark_entries_read '{"entryIds":["<id>"],"read":true}'
//
// list_entries returns at most `limit` items plus a `nextCursor`; page by
// passing that cursor back until it's null. Prints the tool result as JSON on
// stdout (errors and diagnostics go to stderr).

const TOKEN = process.env.LION_READER_TOKEN || process.env.LR_TOKEN;
const ENDPOINT = process.env.LION_READER_MCP_URL || "https://lionreader.com/api/mcp";

const [, , tool, argsJson] = process.argv;

if (!tool || tool === "-h" || tool === "--help") {
  console.error(
    "usage: node scripts/lion-reader.mjs <tool|tools> ['<json-args>']\n" +
      "set LION_READER_TOKEN in the environment first (see file header)."
  );
  process.exit(tool ? 0 : 1);
}
if (!TOKEN) {
  console.error("error: LION_READER_TOKEN (or LR_TOKEN) is not set in the environment.");
  process.exit(1);
}

let args = {};
if (argsJson) {
  try {
    args = JSON.parse(argsJson);
  } catch (err) {
    console.error(`error: args must be valid JSON — ${err.message}`);
    process.exit(1);
  }
}

const rpc =
  tool === "tools" || tool === "tools/list"
    ? { method: "tools/list", params: {} }
    : { method: "tools/call", params: { name: tool, arguments: args } };

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    // Streamable HTTP transport: the server may answer with JSON or SSE.
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), ...rpc }),
});

const raw = await res.text();
if (!res.ok) {
  console.error(`error: HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 500)}`);
  process.exit(1);
}

// Accept either a plain JSON-RPC body or an SSE stream of `data:` frames.
let data;
try {
  data = JSON.parse(raw);
} catch {
  const frame = raw
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("");
  try {
    data = JSON.parse(frame);
  } catch {
    console.error(`error: could not parse response:\n${raw.slice(0, 500)}`);
    process.exit(1);
  }
}

if (data.error) {
  console.error(`RPC error: ${JSON.stringify(data.error)}`);
  process.exit(1);
}

// tools/list -> print the tool names + descriptions; tools/call -> unwrap the
// MCP content envelope (results arrive as content[].text, usually JSON-encoded).
if (rpc.method === "tools/list") {
  for (const t of data.result?.tools ?? []) {
    console.log(`${t.name}\n  ${(t.description ?? "").split("\n")[0]}`);
  }
} else {
  const content = data.result?.content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c.type === "text") {
        try {
          console.log(JSON.stringify(JSON.parse(c.text), null, 2));
        } catch {
          console.log(c.text);
        }
      } else {
        console.log(JSON.stringify(c, null, 2));
      }
    }
  } else {
    console.log(JSON.stringify(data.result, null, 2));
  }
}
