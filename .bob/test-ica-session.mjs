// Discover the ICA Virtual Server session protocol
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const bearer = env.match(/^ICA_BEARER=(.+)$/m)?.[1]?.trim();
const appUrl  = env.match(/^ICA_AGENTIC_APP_URL=(.+)$/m)?.[1]?.trim();
const mcpUrl  = `${appUrl}/mcp`;

async function post(body, extra = {}) {
  const r = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${bearer}`,
      ...extra
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await r.text();
  return { status: r.status, headers: Object.fromEntries(r.headers.entries()), body: text };
}

// Step 1: what does the server return for a plain JSON body (not JSON-RPC)?
console.log("=== plain POST ===");
const r0 = await post({ hello: "world" });
console.log(r0.status, r0.body.substring(0, 300));

// Step 2: try an operation=login style message
console.log("\n=== operation: connect ===");
const r1 = await post({ operation: "connect", bearer });
console.log(r1.status, r1.body.substring(0, 500));

// Step 3: try a session-style message
console.log("\n=== operation: session ===");
const r2 = await post({ operation: "session", token: bearer });
console.log(r2.status, r2.body.substring(0, 500));

// Step 4: look for alternative endpoints
for (const path of ["/chat", "/agent", "/run", "/invoke", "/message", "/send"]) {
  try {
    const r = await fetch(`${appUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${bearer}` },
      body: JSON.stringify({ message: "hello" }),
      signal: AbortSignal.timeout(5000)
    });
    const t = await r.text();
    console.log(`\n=== ${path} === ${r.status}: ${t.substring(0, 200)}`);
  } catch(e) {
    console.log(`\n=== ${path} === ERROR: ${e.message}`);
  }
}
