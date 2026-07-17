import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const bearer = env.match(/^ICA_BEARER=(.+)$/m)?.[1]?.trim();
const appUrl  = env.match(/^ICA_AGENTIC_APP_URL=(.+)$/m)?.[1]?.trim();
const mcpUrl  = new URL(`${appUrl}/mcp`);

console.log("URL:", mcpUrl.toString());
console.log("Bearer prefix:", bearer?.substring(0, 30) + "...");

const transport = new StreamableHTTPClientTransport(mcpUrl, {
  requestInit: { headers: { Authorization: `Bearer ${bearer}` } }
});

const client = new Client({ name: "engagement-ready-ai", version: "1.0" }, { capabilities: {} });

try {
  console.log("Connecting...");
  await client.connect(transport);
  console.log("Connected OK");

  const tools = await client.listTools();
  console.log("Tools found:", tools.tools.length);
  tools.tools.forEach(t =>
    console.log(" -", t.name, ":", (t.description ?? "").substring(0, 100))
  );
} catch (e) {
  console.error("ERROR:", e.message);
  if (e.code) console.error("Code:", e.code);
} finally {
  try { await transport.close(); } catch { /* */ }
}
