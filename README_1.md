# Shenia Events Scraper & API

Scrapes UK tech events from Eventbrite, Luma and Meetup and serves them via a protected REST API.

---

## Project Structure

```
shenia-events-scraper/
├── scraper.js                    ← Scrapes events and saves to data/events.json
├── api.js                        ← REST API server (GET /api/events)
├── data/
│   └── events.json               ← Latest scraped events (auto-generated)
├── .env.example                  ← Copy to .env and add your token
├── .github/
│   └── workflows/
│       └── scraper.yml           ← Runs scraper every Monday at 6am automatically
└── package.json
```

---

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/shenia-events-scraper.git
cd shenia-events-scraper
```

### 2. Set up your environment
```bash
cp .env.example .env
```

Your `.env` file already contains the generated API token. **Keep this secret — share it directly with Ilyass and Zira, never commit it to GitHub.**

### 3. Run the scraper
```bash
node scraper.js
```

This will scrape events and save them to `data/events.json`.

### 4. Start the API
```bash
node api.js
```

The API will be available at `http://localhost:3000`

---

## API Reference

### GET /api/events

Returns all scraped UK tech events.

**Authentication:** Bearer token required

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/api/events
```

**Response:**
```json
{
  "events": [
    {
      "id": "abc123",
      "title": "AI & Tech Networking London",
      "description": "Event description...",
      "start_date": "",
      "end_date": "",
      "lat": null,
      "lng": null,
      "image_url": "https://cdn.evbuc.com/images/...",
      "source": "eventbrite",
      "external_url": "https://www.eventbrite.co.uk/e/..."
    }
  ],
  "total": 42,
  "generated_at": "2026-05-01T06:00:00.000Z"
}
```

**Optional query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| lat | float | Latitude to filter by location |
| lng | float | Longitude to filter by location |
| radius | float | Radius in km (default: 50) |

**Example with location filter:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  "http://localhost:3000/api/events?lat=51.5074&lng=-0.1278&radius=25"
```

### GET /health

Health check endpoint — no authentication required.

```bash
curl http://localhost:3000/health
```

---

## Automated Schedule

The scraper runs automatically every Monday at 6am UTC via GitHub Actions.

To trigger it manually:
1. Go to your GitHub repository
2. Click the **Actions** tab
3. Select **Weekly Events Scraper**
4. Click **Run workflow**

---

## Adding the API Token to GitHub Actions

For the API to work when deployed, add your token as a GitHub Secret:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `EVENTS_API_TOKEN`
5. Value: your token from the `.env` file
6. Click **Add secret**

---

## Your API Token

```
5c76785171d7702961f2775dc3f8b12f8204f97c447007da138686f2aac6b5dd
```

**Share this token with Ilyass and Zira so they can access the API.**
They will use it in their requests as: `Authorization: Bearer 5c76785171d7702961f2775dc3f8b12f8204f97c447007da138686f2aac6b5dd`
