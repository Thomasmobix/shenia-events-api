/**
 * Shenia Events API - Vercel Serverless Function
 * GET /api/events
 * Protected by Bearer token
 * Supports lat/lng/radius filtering
 */

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────
// DISTANCE CALCULATION
// ─────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
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
// MAIN HANDLER
// ─────────────────────────────────────────────
export default function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── CORS headers ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  // ── Bearer token check ──
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const validToken = process.env.EVENTS_API_TOKEN;

  if (!validToken || token !== validToken) {
    return res.status(401).json({ error: "Unauthorized — invalid or missing Bearer token" });
  }

  // ── Load events ──
  let data = { events: [], total: 0, generated_at: new Date().toISOString() };

  try {
    const filePath = path.join(process.cwd(), "data", "events.json");
    const raw = fs.readFileSync(filePath, "utf8");
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read events.json:", e.message);
  }

  let events = data.events || [];

  // ── Optional lat/lng/radius filtering ──
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 50;

  if (!isNaN(lat) && !isNaN(lng)) {
    events = events.filter((event) => {
      const eventLat = parseFloat(event.address?.lat);
      const eventLng = parseFloat(event.address?.lng);
      if (isNaN(eventLat) || isNaN(eventLng)) return true;
      return getDistanceKm(lat, lng, eventLat, eventLng) <= radius;
    });
  }

  // ── Return response ──
  return res.status(200).json({
    events,
    total: events.length,
    generated_at: data.generated_at || new Date().toISOString(),
  });
}
