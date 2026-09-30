// Deploy-time step: writes config.js from the API_BASE_URL environment variable so the
// production API address never lives in the repository. No dependencies; runs on Node 16+.
const fs = require("fs");
const path = require("path");

const raw = (process.env.API_BASE_URL || "").trim();
const onHost = Boolean(process.env.VERCEL || process.env.RENDER || process.env.CI);

if (!raw) {
  if (onHost) {
    console.error("build-config: API_BASE_URL is not set. Add it in your host's environment variables (for example https://your-api.onrender.com).");
    process.exit(1);
  }
  console.warn("build-config: API_BASE_URL not set; writing empty config (browser-only demo mode).");
}

let url = raw.replace(/\/+$/, "");
if (url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("must start with http:// or https://");
    if (parsed.pathname !== "/" && parsed.pathname !== "") throw new Error("must be the origin only, without a path such as /api");
    url = parsed.origin;
  } catch (err) {
    console.error(`build-config: invalid API_BASE_URL (${err.message}).`);
    process.exit(1);
  }
}

const body = `window.SPENDWISE_CONFIG = ${JSON.stringify({ API_BASE_URL: url })};\n`;
fs.writeFileSync(path.join(__dirname, "config.js"), body);
console.log(`build-config: wrote config.js (${url ? "API configured" : "demo mode"}).`);
