// Copy to config.js for local testing against a remote API. config.js is git-ignored.
// In production it is generated at deploy time by build-config.js from the API_BASE_URL env var.
window.SPENDWISE_CONFIG = {
  API_BASE_URL: "" // e.g. "https://your-api-service.onrender.com" (no trailing slash, no /api)
};
