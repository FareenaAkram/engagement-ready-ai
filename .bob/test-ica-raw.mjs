// Raw HTTP test — capture exactly what the Virtual Server returns
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const bearer = env.match(/^ICA_BEARER=(.+)$/m)?.[1]?.trim();
const appUrl  = env.match(/^ICA_AGENTIC_APP_URL=(.+)$/m)?.[1]?.trim();
const mcpUrl  = `${appUrl}/mcp`;

console.log("URL:", mcpUrl);

// Test 1: initialize
const initBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "engagement-ready-ai", version: "1.0" }
  }
});

try {
  console.log("\n=== initialize ===");
  const r = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${bearer}`,
      "MCP-Protocol-Version": "2024-11-05"
    },
    body: initBody,
    signal: AbortSignal.timeout(15000)
  });
  console.log("Status:", r.status);
  console.log("Content-Type:", r.headers.get("content-type"));
  const raw = await r.text();
  console.log("Body (first 2000 chars):", raw.substring(0, 2000));
} catch(e) {
  console.error("ERROR:", e.message);
}

// Test 2: what is a GET to the base URL?
try {
  console.log("\n=== GET base URL ===");
  const r2 = await fetch(mcpUrl, {
    method: "GET",
    headers: { "Authorization": `Bearer ${bearer}` },
    signal: AbortSignal.timeout(10000)
  });
  console.log("Status:", r2.status);
  const raw2 = await r2.text();
  console.log("Body:", raw2.substring(0, 500));
} catch(e) {
  console.error("GET ERROR:", e.message);
}
