// LeadDesk MCP server over Streamable HTTP (bonus E1) — the same factory as the stdio entry.
//
//   node src/http.mjs        http://127.0.0.1:3333/mcp, loopback only
//
// DNS rebinding protection: the Host and Origin guards are CALLED here, before the MCP handler.
// Passed as an option to toNodeHandler they would be silently ignored, and a forged Host would
// get 200. Each guard writes the 403 itself and returns false.
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from "@modelcontextprotocol/node";
import { factory } from "./leaddesk.mjs";

const HOST = "127.0.0.1";
const PORT = 3333;

const mcp = toNodeHandler(createMcpHandler(factory));
const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();

createServer(async (req, res) => {
  if (!checkHost(req, res)) return;
  if (!checkOrigin(req, res)) return;
  await mcp(req, res);
}).listen(PORT, HOST, () => console.error(`leaddesk: http://${HOST}:${PORT}/mcp`));
