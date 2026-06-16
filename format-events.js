/**
 * Event Formatter
 * Converts raw scraped events into Shenia's required format
 */

const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(__dirname, "data", "events_raw.json");
const OUTPUT_FILE = path.join(__dirname, "data", "events.json");

// ─────────────────────────────────────────────
// PARSE ADDRESS
// Attempts to break a full address string into parts
// ─────────────────────────────────────────────
function parseAddress(locationString, id) {
  if (!locationString) {
    return {
      id,
      lat: null,
      lng: null,
      first_line: "",
      town_city: "",
      county: "",
      postcode_zip: "",
    };
  }

  // Try to extract postcode (UK format)
  const postcodeMatch = locationString.match(
    /([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i
  );
  const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : "";

  // Remove postcode from string for further parsing
  const withoutPostcode = locationString.replace(postcode, "").trim();

  // Split by comma
  const parts = withoutPostcode.split(",").map((p) => p.trim()).filter(Boolean);

  const first_line = parts[0] || "";
  const town_city = parts[parts.length - 1] || "";

  // Common UK county mappings based on city
  const countyMap = {
    london: "Greater London",
    manchester: "Greater Manchester",
    birmingham: "West Midlands",
    edinburgh: "Midlothian",
    glasgow: "Lanarkshire",
    bristol: "Avon",
    leeds: "West Yorkshire",
    liverpool: "Merseyside",
    newcastle: "Tyne and Wear",
    sheffield: "South Yorkshire",
    nottingham: "Nottinghamshire",
    leicester: "Leicestershire",
    derby: "Derbyshire",
    oxford: "Oxfordshire",
    cambridge: "Cambridgeshire",
    cardiff: "South Glamorgan",
    belfast: "County Antrim",
    swindon: "Wiltshire",
    "milton keynes": "Buckinghamshire",
  };

  const cityLower = town_city.toLowerCase();
  const county = Object.keys(countyMap).find((k) => cityLower.includes(k))
    ? countyMap[Object.keys(countyMap).find((k) => cityLower.includes(k))]
    : "";

  return {
    id,
    lat: null,
    lng: null,
    first_line,
    town_city,
    county,
    postcode_zip: postcode,
  };
}

// ─────────────────────────────────────────────
// GENERATE TAGS from title and description
// ─────────────────────────────────────────────
function generateTags(title, description) {
  const techKeywords = [
    "tech", "AI", "artificial intelligence", "machine learning", "data",
    "cloud", "cyber", "security", "blockchain", "crypto", "web3", "startup",
    "fintech", "medtech", "cleantech", "green tech", "SaaS", "software",
    "developer", "coding", "digital", "innovation", "networking", "investors",
    "founders", "CTO", "engineering", "space tech", "defence", "IoT",
  ];

  const text = `${title} ${description}`.toLowerCase();
  const found = techKeywords.filter((kw) => text.includes(kw.toLowerCase()));

  // Take first 5 matches, fallback to "technology,networking"
  return found.length > 0
    ? found.slice(0, 5).join(",")
    : "technology,networking";
}

// ─────────────────────────────────────────────
// FORMAT SINGLE EVENT
// ─────────────────────────────────────────────
function formatEvent(rawEvent, index) {
  const id = index + 1;

  return {
    id,
    name: rawEvent.title || rawEvent.name || "",
    description: rawEvent.description || rawEvent.aboutEvent || "",
    date_event_start: rawEvent.start_date || rawEvent.dateTime || "",
    date_event_end: rawEvent.end_date || "",
    thumbnail_image_url: rawEvent.image_url || rawEvent.Image || rawEvent.image || "",
    header_image_url: rawEvent.image_url || rawEvent.Image || rawEvent.image || "",
    event_url: rawEvent.external_url || rawEvent.Title_URL || rawEvent.link || "",
    event_tags: generateTags(
      rawEvent.title || rawEvent.name || "",
      rawEvent.description || rawEvent.aboutEvent || ""
    ),
    active: true,
    featured: true,
    address: parseAddress(
      rawEvent.location?.address ||
        (typeof rawEvent.location === "string" ? rawEvent.location : "") ||
        rawEvent.location_string ||
        "",
      id
    ),
    event_categories: [
      {
        id: 1,
        category_name: "Technology",
        category_colour: "#20CDDB",
        category_desciption: "Tech events and conferences",
        active: true,
      },
    ],
    events_event_categories_ms: [],
    social_shares: [],
    users: [],
    users_events_ms: [],
  };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
function formatEvents(inputData) {
  let rawEvents = [];

  // Handle both array format and wrapped format
  if (Array.isArray(inputData)) {
    rawEvents = inputData;
  } else if (inputData.events) {
    rawEvents = inputData.events;
  }

  const formatted = rawEvents.map((event, index) => formatEvent(event, index));

  const output = {
    events: formatted,
    total: formatted.length,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`✅ Formatted ${formatted.length} events`);
  console.log(`   Saved to: ${OUTPUT_FILE}`);

  return output;
}

// Run if called directly
if (require.main === module) {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.error("   Run the scraper first: node scraper.js");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  formatEvents(raw);
}

module.exports = { formatEvents, formatEvent };
