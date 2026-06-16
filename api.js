/**
 * Shenia Events API
 * GET /api/events — returns events from data/events.json
 * Protected by Bearer token
 * Supports lat/lng/radius filtering
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.EVENTS_API_TOKEN;
const DATA_FILE = path.join(__dirname, "data", "events.json");

if (!API_TOKEN) {
  console.error("❌ ERROR: EVENTS_API_TOKEN environment variable is not set!");
  console.error("   Add it to your .env file or set it in your environment.");
  process.exit(1);
}

// ─────────────────────────────────────────────
// DISTANCE CALCULATION (Haversine formula)
// ─────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────
// LOAD EVENTS
// ─────────────────────────────────────────────
function loadEvents() {
  if (!fs.existsSync(DATA_FILE)) {
    return { events: [], total: 0, generated_at: null };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Failed to parse events.json:", e.message);
    return { events: [], total: 0, generated_at: null };
  }
}

// ─────────────────────────────────────────────
// SEND JSON RESPONSE
// ─────────────────────────────────────────────
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────
// REQUEST HANDLER
// ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  // Health check endpoint (no auth required)
  if (req.method === "GET" && parsed.pathname === "/health") {
    return sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  }

  // Only handle GET /api/events
  if (req.method !== "GET" || parsed.pathname !== "/api/events") {
    return sendJson(res, 404, { error: "Not found" });
  }

  // ── Bearer token authentication ──
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (token !== API_TOKEN) {
    return sendJson(res, 401, { error: "Unauthorized — invalid or missing Bearer token" });
  }

  // ── Load events ──
  const data = loadEvents();
  let events = data.events || [];

  // ── Optional lat/lng/radius filtering ──
  const lat = parseFloat(parsed.searchParams.get("lat"));
  const lng = parseFloat(parsed.searchParams.get("lng"));
  const radius = parseFloat(parsed.searchParams.get("radius")) || 50; // default 50km

  if (!isNaN(lat) && !isNaN(lng)) {
    events = events.filter((event) => {
      if (event.lat == null || event.lng == null) return true; // include events without coords
      const distance = getDistanceKm(lat, lng, event.lat, event.lng);
      return distance <= radius;
    });
  }

  // ── Return response ──
  return sendJson(res, 200, {
    events,
    total: events.length,
    generated_at: data.generated_at || new Date().toISOString(),
  });
});

server.listen(PORT, () => {
  console.log(`✅ Shenia Events API running on port ${PORT}`);
  console.log(`   Endpoint: http://localhost:${PORT}/api/events`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Token:    Set via EVENTS_API_TOKEN environment variable`);
});
