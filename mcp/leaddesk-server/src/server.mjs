// LeadDesk MCP server over stdio — the entry that Claude Code and the Inspector start.
//
//   node src/server.mjs                                         fixtures/leads.json next to src/
//   LEADDESK_FIXTURE=/path/to/leads.json node src/server.mjs    another copy of the fixture
//
// Tools, resource and data are in leaddesk.mjs. stdout is the protocol channel, so logs go to
// stderr only (console.error) and carry no personal data.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { factory } from "./leaddesk.mjs";

await serveStdio(factory);
