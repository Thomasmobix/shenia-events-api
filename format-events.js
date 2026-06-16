/**
 * Event Formatter
 * Converts raw scraped events into Shenia's required format
 */

const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(__dirname, "data", "events_raw.json");
const OUTPUT_FILE = path.join(__dirname, "data", "events.json");

// County mapping
const COUNTY_MAP = {
  london: "Greater London", manchester: "Greater Manchester",
  birmingham: "West Midlands", edinburgh: "Midlothian",
  glasgow: "Lanarkshire", bristol: "Avon", leeds: "West Yorkshire",
  liverpool: "Merseyside", newcastle: "Tyne and Wear", sheffield: "South Yorkshire",
  nottingham: "Nottinghamshire", leicester: "Leicestershire", derby: "Derbyshire",
  oxford: "Oxfordshire", cambridge: "Cambridgeshire", cardiff: "South Glamorgan",
  belfast: "County Antrim", swindon: "Wiltshire", "milton keynes": "Buckinghamshire",
  brighton: "East Sussex", southampton: "Hampshire", portsmouth: "Hampshire",
};

function cleanPostcode(postcode) {
  if (!postcode) return "";
  // Remove any HTML entities or garbage characters
  const cleaned = postcode
    .replace(/U003C.*$/i, "")  // Remove U003CP and similar HTML entity artifacts
    .replace(/&#x[0-9A-Fa-f]+;/g, "")
    .replace(/&[a-zA-Z]+;/g, "")
    .trim();
  // Validate it looks like a UK postcode
  if (cleaned.match(/^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i)) {
    return cleaned.toUpperCase();
  }
  // If it doesn't look like a valid postcode after cleaning, return empty
  if (cleaned.includes("U00") || cleaned.length > 10) return "";
  return cleaned;
}

function getCounty(city) {
  if (!city) return "";
  const key = Object.keys(COUNTY_MAP).find(k => city.toLowerCase().includes(k));
  return key ? COUNTY_MAP[key] : "";
}

function generateTags(title, description) {
  const keywords = [
    "tech", "AI", "artificial intelligence", "machine learning", "data",
    "cloud", "cyber", "security", "blockchain", "crypto", "web3", "startup",
    "fintech", "medtech", "cleantech", "SaaS", "software", "developer",
    "coding", "digital", "innovation", "networking", "investors", "founders",
    "CTO", "engineering", "IoT",
  ];
  const text = `${title} ${description}`.toLowerCase();
  const found = keywords.filter(kw => text.includes(kw.toLowerCase()));
  return found.length > 0 ? found.slice(0, 5).join(",") : "technology,networking";
}

function formatEvent(rawEvent, index) {
  const id = index + 1;
  const city = rawEvent.city || "";
  const county = getCounty(city);

  return {
    id,
    name: rawEvent.title || rawEvent.name || "",
    description: rawEvent.description || rawEvent.aboutEvent || "",
    date_event_start: rawEvent.start_date || "",
    date_event_end: rawEvent.end_date || "",
    thumbnail_image_url: rawEvent.image_url || rawEvent.Image || "",
    header_image_url: rawEvent.image_url || rawEvent.Image || "",
    event_url: rawEvent.external_url || rawEvent.Title_URL || "",
    event_tags: generateTags(rawEvent.title || rawEvent.name || "", rawEvent.description || ""),
    active: true,
    featured: true,
    address: {
      id,
      lat: rawEvent.lat ? String(rawEvent.lat) : null,
      lng: rawEvent.lng ? String(rawEvent.lng) : null,
      first_line: rawEvent.address || "",
      town_city: city,
      county,
      postcode_zip: cleanPostcode(rawEvent.postcode || ""),
    },
    event_categories: [{
      id: 1,
      category_name: "Technology",
      category_colour: "#20CDDB",
      category_desciption: "Tech events and conferences",
      active: true,
    }],
    events_event_categories_ms: [],
    social_shares: [],
    users: [],
    users_events_ms: [],
  };
}

function formatEvents(inputData) {
  let rawEvents = Array.isArray(inputData) ? inputData : (inputData.events || []);
  const formatted = rawEvents.map((event, index) => formatEvent(event, index));

  const output = {
    events: formatted,
    total: formatted.length,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`✅ Formatted ${formatted.length} events`);
  console.log(`   With dates: ${formatted.filter(e => e.date_event_start).length}`);
  console.log(`   With city: ${formatted.filter(e => e.address.town_city).length}`);
  console.log(`   With postcode: ${formatted.filter(e => e.address.postcode_zip).length}`);
  console.log(`   Saved to: ${OUTPUT_FILE}`);
  return output;
}

if (require.main === module) {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  formatEvents(raw);
}

module.exports = { formatEvents, formatEvent };
