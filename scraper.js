/**
 * Shenia Events Scraper - Updated
 * Fixes: dates, addresses, UK-only Meetup filtering
 * Scrapes UK tech events from Eventbrite, Luma and Meetup
 * Uses og:image meta tags for real event images
 * Saves results to data/events_raw.json
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  rawOutputFile: path.join(__dirname, "data", "events_raw.json"),
  outputFile: path.join(__dirname, "data", "events.json"),
};

// UK cities for location filtering
const UK_CITIES = [
  "london", "manchester", "birmingham", "edinburgh", "glasgow",
  "bristol", "leeds", "liverpool", "newcastle", "sheffield",
  "nottingham", "cardiff", "belfast", "oxford", "cambridge",
  "swindon", "derby", "leicester", "milton keynes", "brighton",
  "southampton", "portsmouth", "exeter", "york", "hull",
  "coventry", "wolverhampton", "stoke", "reading", "dundee",
  "aberdeen", "inverness", "swansea", "united kingdom", "uk",
  "england", "scotland", "wales", "northern ireland", "gb",
  "hampshire", "surrey", "kent", "essex", "midlands", "yorkshire"
];

// ─────────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────────
function fetchUrl(urlString, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Too many redirects"));
    const parsed = new URL(urlString);
    const lib = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    };
    const req = lib.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        return resolve(fetchUrl(redirectUrl, redirectCount + 1));
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Request timeout")); });
    req.end();
  });
}

// ─────────────────────────────────────────────
// META TAG EXTRACTORS
// ─────────────────────────────────────────────
function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// DATE EXTRACTION
// Tries multiple methods to find event dates
// ─────────────────────────────────────────────
function extractDates(html, url) {
  let start_date = "";
  let end_date = "";

  // Method 1: JSON-LD structured data (most reliable)
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const scriptTag of jsonLdMatches) {
    try {
      const jsonContent = scriptTag.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      const data = JSON.parse(jsonContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.startDate) { start_date = item.startDate; }
        if (item.endDate) { end_date = item.endDate; }
        if (start_date) break;
      }
    } catch (e) {}
    if (start_date) break;
  }

  // Method 2: og:start_time / article:published_time
  if (!start_date) {
    start_date = extractMeta(html, "og:start_time") ||
                 extractMeta(html, "event:start_time") ||
                 extractMeta(html, "article:published_time") || "";
  }

  // Method 3: datetime attributes on time elements
  if (!start_date) {
    const timeMatches = html.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi) || [];
    if (timeMatches.length > 0) {
      const dtMatch = timeMatches[0].match(/datetime=["']([^"']+)["']/i);
      if (dtMatch) start_date = dtMatch[1];
    }
    if (timeMatches.length > 1) {
      const dtMatch = timeMatches[1].match(/datetime=["']([^"']+)["']/i);
      if (dtMatch) end_date = dtMatch[1];
    }
  }

  // Method 4: Eventbrite specific patterns
  if (!start_date && url.includes("eventbrite")) {
    const ebDate = html.match(/"startDate"\s*:\s*"([^"]+)"/i);
    if (ebDate) start_date = ebDate[1];
    const ebEndDate = html.match(/"endDate"\s*:\s*"([^"]+)"/i);
    if (ebEndDate) end_date = ebEndDate[1];
  }

  // Ensure ISO format
  if (start_date && !start_date.includes("T") && start_date.match(/\d{4}-\d{2}-\d{2}/)) {
    start_date = start_date + "T00:00:00Z";
  }
  if (end_date && !end_date.includes("T") && end_date.match(/\d{4}-\d{2}-\d{2}/)) {
    end_date = end_date + "T00:00:00Z";
  }

  return { start_date, end_date };
}

// ─────────────────────────────────────────────
// ADDRESS EXTRACTION
// ─────────────────────────────────────────────
function extractAddress(html, url) {
  let address = "";
  let city = "";
  let postcode = "";
  let lat = null;
  let lng = null;

  // Method 1: JSON-LD location data
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const scriptTag of jsonLdMatches) {
    try {
      const jsonContent = scriptTag.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      const data = JSON.parse(jsonContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const location = item.location || item.place || {};
        if (location.address) {
          const addr = location.address;
          address = addr.streetAddress || addr.street || "";
          city = addr.addressLocality || addr.city || "";
          postcode = addr.postalCode || addr.postcode || "";
        }
        if (location.geo) {
          lat = location.geo.latitude || null;
          lng = location.geo.longitude || null;
        }
        if (address || city) break;
      }
    } catch (e) {}
    if (address || city) break;
  }

  // Method 2: og:locality / og:street-address
  if (!city) {
    city = extractMeta(html, "og:locality") ||
           extractMeta(html, "place:location:city") || "";
  }
  if (!address) {
    address = extractMeta(html, "og:street-address") || "";
  }
  if (!postcode) {
    postcode = extractMeta(html, "og:postal-code") || "";
  }

  // Method 3: Extract postcode from page text
  if (!postcode) {
    const postcodeMatch = html.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
    if (postcodeMatch) postcode = postcodeMatch[1].toUpperCase();
  }

  // Method 4: Detect city from UK cities list in page content
  if (!city) {
    const lowerHtml = html.toLowerCase();
    for (const ukCity of ["london", "manchester", "birmingham", "edinburgh", "glasgow", "bristol", "leeds", "liverpool", "newcastle", "sheffield", "nottingham", "cardiff", "belfast", "oxford", "cambridge", "derby", "leicester"]) {
      if (lowerHtml.includes(ukCity)) {
        city = ukCity.charAt(0).toUpperCase() + ukCity.slice(1);
        break;
      }
    }
  }

  return { address, city, postcode, lat, lng };
}

// ─────────────────────────────────────────────
// UK LOCATION FILTER
// ─────────────────────────────────────────────
function isUKEvent(title, description, url, start_date) {
  // Always include Eventbrite UK and Luma events
  if (url.includes("eventbrite.co.uk") || url.includes("lu.ma")) return true;

  // Reject events with US/Canada timezones
  if (start_date) {
    // US timezones: -04:00, -05:00, -06:00, -07:00, -08:00
    if (start_date.match(/-0[4-8]:00$/)) return false;
  }

  const text = (title + " " + description).toLowerCase();
  return UK_CITIES.some(city => text.includes(city));
}

// ─────────────────────────────────────────────
// SCRAPE SINGLE EVENT PAGE
// ─────────────────────────────────────────────
async function scrapeEventPage(url) {
  try {
    const { body } = await fetchUrl(url);
    const dates = extractDates(body, url);
    const location = extractAddress(body, url);
    return {
      image: extractMeta(body, "og:image"),
      title: decodeHtml(extractMeta(body, "og:title")),
      description: decodeHtml(extractMeta(body, "og:description")),
      start_date: dates.start_date,
      end_date: dates.end_date,
      address: location.address,
      city: location.city,
      postcode: location.postcode,
      lat: location.lat,
      lng: location.lng,
    };
  } catch (e) {
    return { image: "", title: "", description: "", start_date: "", end_date: "", address: "", city: "", postcode: "", lat: null, lng: null };
  }
}

// ─────────────────────────────────────────────
// EVENTBRITE SCRAPER
// ─────────────────────────────────────────────
async function scrapeEventbrite() {
  console.log("\n🔍 Scraping Eventbrite...");
  const events = [];
  const urls = [
    "https://www.eventbrite.co.uk/d/united-kingdom/tech--events/",
    "https://www.eventbrite.co.uk/d/united-kingdom/ai--events/",
    "https://www.eventbrite.co.uk/d/united-kingdom/technology--events/",
  ];

  for (const url of urls) {
    try {
      const { body } = await fetchUrl(url);
      const eventUrlPattern = /https:\/\/www\.eventbrite\.co\.uk\/e\/[a-zA-Z0-9\-]+-tickets-\d+\/?/g;
      const foundUrls = [...new Set(body.match(eventUrlPattern) || [])];
      console.log(`  Found ${foundUrls.length} event URLs on Eventbrite`);

      for (const eventUrl of foundUrls.slice(0, 12)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);
        if (details.title) {
          events.push({
            title: details.title,
            description: details.description,
            start_date: details.start_date,
            end_date: details.end_date,
            image_url: details.image,
            source: "eventbrite",
            external_url: eventUrl,
            address: details.address,
            city: details.city,
            postcode: details.postcode,
            lat: details.lat,
            lng: details.lng,
          });
          console.log(`  ✅ ${details.title.substring(0, 55)} | ${details.start_date || "no date"} | ${details.city || "no city"}`);
        }
      }
      await sleep(1000);
    } catch (e) {
      console.log(`  ❌ Eventbrite error: ${e.message}`);
    }
  }
  return events;
}

// ─────────────────────────────────────────────
// LUMA SCRAPER
// ─────────────────────────────────────────────
async function scrapeLuma() {
  console.log("\n🔍 Scraping Luma...");
  const events = [];
  const urls = ["https://lu.ma/london", "https://lu.ma/manchester", "https://lu.ma/uk"];

  for (const url of urls) {
    try {
      const { body } = await fetchUrl(url);
      const eventUrlPattern = /https:\/\/lu\.ma\/[a-zA-Z0-9\-_]+/g;
      const foundUrls = [...new Set(
        (body.match(eventUrlPattern) || []).filter(u =>
          !u.includes("/discover") && !u.includes("/london") &&
          !u.includes("/manchester") && !u.includes("/uk") && u !== "https://lu.ma"
        )
      )];
      console.log(`  Found ${foundUrls.length} event URLs on Luma`);

      for (const eventUrl of foundUrls.slice(0, 10)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);
        if (details.title) {
          events.push({
            title: details.title,
            description: details.description,
            start_date: details.start_date,
            end_date: details.end_date,
            image_url: details.image,
            source: "luma",
            external_url: eventUrl,
            address: details.address,
            city: details.city,
            postcode: details.postcode,
            lat: details.lat,
            lng: details.lng,
          });
          console.log(`  ✅ ${details.title.substring(0, 55)} | ${details.start_date || "no date"} | ${details.city || "no city"}`);
        }
      }
      await sleep(1000);
    } catch (e) {
      console.log(`  ❌ Luma error: ${e.message}`);
    }
  }
  return events;
}

// ─────────────────────────────────────────────
// MEETUP SCRAPER (UK only)
// ─────────────────────────────────────────────
async function scrapeMeetup() {
  console.log("\n🔍 Scraping Meetup (UK only)...");
  const events = [];

  // Strictly UK URLs only
  const urls = [
    "https://www.meetup.com/find/?keywords=tech&location=London%2C+GB&source=EVENTS",
    "https://www.meetup.com/find/?keywords=tech&location=Manchester%2C+GB&source=EVENTS",
    "https://www.meetup.com/find/?keywords=tech&location=Birmingham%2C+GB&source=EVENTS",
    "https://www.meetup.com/find/?keywords=AI&location=London%2C+GB&source=EVENTS",
  ];

  for (const url of urls) {
    try {
      const { body } = await fetchUrl(url);
      const eventUrlPattern = /https:\/\/www\.meetup\.com\/[a-zA-Z0-9\-]+\/events\/\d+\/?/g;
      const foundUrls = [...new Set(body.match(eventUrlPattern) || [])];
      console.log(`  Found ${foundUrls.length} event URLs on Meetup`);

      for (const eventUrl of foundUrls.slice(0, 10)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);

        // Strict UK filter — skip if no UK location detected
        if (!details.title) continue;
        if (!isUKEvent(details.title, details.description, eventUrl, details.start_date)) {
          console.log(`  ⚠️  SKIPPED (not UK): ${details.title.substring(0, 55)}`);
          continue;
        }

        events.push({
          title: details.title,
          description: details.description,
          start_date: details.start_date,
          end_date: details.end_date,
          image_url: details.image,
          source: "meetup",
          external_url: eventUrl,
          address: details.address,
          city: details.city,
          postcode: details.postcode,
          lat: details.lat,
          lng: details.lng,
        });
        console.log(`  ✅ ${details.title.substring(0, 55)} | ${details.start_date || "no date"} | ${details.city || "no city"}`);
      }
      await sleep(1000);
    } catch (e) {
      console.log(`  ❌ Meetup error: ${e.message}`);
    }
  }
  return events;
}

// ─────────────────────────────────────────────
// DEDUPLICATE
// ─────────────────────────────────────────────
function deduplicate(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event.title || !event.external_url) return false;
    const key = event.external_url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function run() {
  console.log("================================================");
  console.log("  SHENIA EVENTS SCRAPER");
  console.log(`  ${new Date().toISOString()}`);
  console.log("================================================");

  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const [ebEvents, lumaEvents, meetupEvents] = await Promise.allSettled([
    scrapeEventbrite(),
    scrapeLuma(),
    scrapeMeetup(),
  ]);

  const allEvents = [
    ...(ebEvents.status === "fulfilled" ? ebEvents.value : []),
    ...(lumaEvents.status === "fulfilled" ? lumaEvents.value : []),
    ...(meetupEvents.status === "fulfilled" ? meetupEvents.value : []),
  ];

  const cleanEvents = deduplicate(allEvents);

  const output = {
    events: cleanEvents,
    total: cleanEvents.length,
    generated_at: new Date().toISOString(),
  };

  // Save raw output for formatter
  fs.writeFileSync(CONFIG.rawOutputFile, JSON.stringify(output, null, 2));
  // Also save directly as backup
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));

  console.log("\n================================================");
  console.log(`  ✅ COMPLETE`);
  console.log(`  Total events: ${cleanEvents.length}`);
  console.log(`  Eventbrite: ${cleanEvents.filter(e => e.source === "eventbrite").length}`);
  console.log(`  Luma: ${cleanEvents.filter(e => e.source === "luma").length}`);
  console.log(`  Meetup: ${cleanEvents.filter(e => e.source === "meetup").length}`);
  console.log(`  With dates: ${cleanEvents.filter(e => e.start_date).length}`);
  console.log(`  With city: ${cleanEvents.filter(e => e.city).length}`);
  console.log("================================================\n");
}

run().catch(console.error);
