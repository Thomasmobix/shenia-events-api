/**
 * Shenia Events Scraper
 * Scrapes UK tech events from Eventbrite, Luma and Meetup
 * Uses og:image meta tags for real event images
 * Saves results to data/events.json
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
  outputFile: path.join(__dirname, "data", "events.json"),
  targetCount: 30,
  searchTerms: ["tech", "AI", "technology"],
  location: "United Kingdom",
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Simple HTTP GET that returns the response body as a string
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
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    };

    const req = lib.request(options, (res) => {
      // Follow redirects
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

// Extract og:image from HTML
function extractOgImage(html) {
  const match = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
  );
  return match ? match[1] : "";
}

// Extract og:title from HTML
function extractOgTitle(html) {
  const match = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
  );
  return match ? match[1] : "";
}

// Extract og:description from HTML
function extractOgDescription(html) {
  const match = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i
  );
  return match ? match[1] : "";
}

// Clean HTML entities
function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Generate a simple ID from a URL
function generateId(url) {
  return Buffer.from(url).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
}

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// SCRAPE EVENT PAGE (get og:image + details)
// ─────────────────────────────────────────────
async function scrapeEventPage(url) {
  try {
    const { body } = await fetchUrl(url);
    return {
      image: extractOgImage(body),
      title: decodeHtml(extractOgTitle(body)),
      description: decodeHtml(extractOgDescription(body)),
    };
  } catch (e) {
    return { image: "", title: "", description: "" };
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

      // Extract event URLs from the listing page
      const eventUrlPattern =
        /https:\/\/www\.eventbrite\.co\.uk\/e\/[a-zA-Z0-9\-]+-tickets-\d+\/?/g;
      const foundUrls = [...new Set(body.match(eventUrlPattern) || [])];

      console.log(`  Found ${foundUrls.length} event URLs on ${url}`);

      for (const eventUrl of foundUrls.slice(0, 12)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);

        if (details.title) {
          events.push({
            id: generateId(eventUrl),
            title: details.title,
            description: details.description,
            start_date: "",
            end_date: "",
            lat: null,
            lng: null,
            image_url: details.image,
            source: "eventbrite",
            external_url: eventUrl,
          });
          console.log(`  ✅ ${details.title.substring(0, 60)}`);
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

  const urls = [
    "https://lu.ma/london",
    "https://lu.ma/manchester",
    "https://lu.ma/uk",
  ];

  for (const url of urls) {
    try {
      const { body } = await fetchUrl(url);

      // Extract Luma event URLs
      const eventUrlPattern = /https:\/\/lu\.ma\/[a-zA-Z0-9\-_]+/g;
      const foundUrls = [
        ...new Set(
          (body.match(eventUrlPattern) || []).filter(
            (u) =>
              !u.includes("/discover") &&
              !u.includes("/london") &&
              !u.includes("/manchester") &&
              !u.includes("/uk") &&
              u !== "https://lu.ma"
          )
        ),
      ];

      console.log(`  Found ${foundUrls.length} event URLs on ${url}`);

      for (const eventUrl of foundUrls.slice(0, 10)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);

        if (details.title) {
          events.push({
            id: generateId(eventUrl),
            title: details.title,
            description: details.description,
            start_date: "",
            end_date: "",
            lat: null,
            lng: null,
            image_url: details.image,
            source: "luma",
            external_url: eventUrl,
          });
          console.log(`  ✅ ${details.title.substring(0, 60)}`);
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
// MEETUP SCRAPER
// ─────────────────────────────────────────────
async function scrapeMeetup() {
  console.log("\n🔍 Scraping Meetup...");
  const events = [];

  const urls = [
    "https://www.meetup.com/find/?keywords=tech&location=London%2C+GB&source=EVENTS",
    "https://www.meetup.com/find/?keywords=tech&location=Manchester%2C+GB&source=EVENTS",
    "https://www.meetup.com/find/?keywords=AI&location=United+Kingdom&source=EVENTS",
  ];

  for (const url of urls) {
    try {
      const { body } = await fetchUrl(url);

      // Extract Meetup event URLs
      const eventUrlPattern =
        /https:\/\/www\.meetup\.com\/[a-zA-Z0-9\-]+\/events\/\d+\/?/g;
      const foundUrls = [...new Set(body.match(eventUrlPattern) || [])];

      console.log(`  Found ${foundUrls.length} event URLs on ${url}`);

      for (const eventUrl of foundUrls.slice(0, 10)) {
        await sleep(500);
        const details = await scrapeEventPage(eventUrl);

        if (details.title) {
          events.push({
            id: generateId(eventUrl),
            title: details.title,
            description: details.description,
            start_date: "",
            end_date: "",
            lat: null,
            lng: null,
            image_url: details.image,
            source: "meetup",
            external_url: eventUrl,
          });
          console.log(`  ✅ ${details.title.substring(0, 60)}`);
        }
      }

      await sleep(1000);
    } catch (e) {
      console.log(`  ❌ Meetup error: ${e.message}`);
    }
  }

  return events;
}

// ─────────────────────────────────────────────
// CLEAN & DEDUPLICATE
// ─────────────────────────────────────────────
function cleanAndDeduplicate(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event.title || !event.external_url) return false;
    const key = event.external_url.toLowerCase();
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

  // Ensure data directory exists
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Scrape all platforms
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

  // Clean and deduplicate
  const cleanEvents = cleanAndDeduplicate(allEvents);

  // Build output
  const output = {
    events: cleanEvents,
    total: cleanEvents.length,
    generated_at: new Date().toISOString(),
  };

  // Save to file
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));

  console.log("\n================================================");
  console.log(`  ✅ COMPLETE`);
  console.log(`  Total events: ${cleanEvents.length}`);
  console.log(
    `  Eventbrite: ${cleanEvents.filter((e) => e.source === "eventbrite").length}`
  );
  console.log(
    `  Luma: ${cleanEvents.filter((e) => e.source === "luma").length}`
  );
  console.log(
    `  Meetup: ${cleanEvents.filter((e) => e.source === "meetup").length}`
  );
  console.log(`  Saved to: ${CONFIG.outputFile}`);
  console.log("================================================\n");
}

run().catch(console.error);
