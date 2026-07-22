# RUN — paste this into a fresh Claude Code chat to build a call list

**Claude: read this, then do what it says.** This repo is an on-demand cold-call
list builder. When the owner gives you a target, you launch a live Google Maps
scrape, flag weak listings, and write the results to their Google Sheet. You do
**not** place any calls.

## What the owner will tell you

A target in plain English, e.g.:

> "Marine detailing businesses in Pinellas County, about 60."

From that, pull out three things:
- **search** — the business type, e.g. `marine detailing`
- **location** — the area, e.g. `Pinellas County, Florida`
- **count** — roughly how many to pull, e.g. `60` (default to 60 if unsaid)

## What you do

1. Make sure dependencies are installed (run `npm install` if `node_modules` is missing).
2. Run this one command from the repo root, filling in the three values:

   ```
   npm start -- --search "SEARCH" --location "LOCATION" --count COUNT
   ```

   Example:
   ```
   npm start -- --search "marine detailing" --location "Pinellas County, Florida" --count 60
   ```

3. The script prints a **run summary** (total scraped, written, how many flagged
   for low reviews / no website, how many capped off) and the sheet tab name.
   Relay that summary to the owner and give them the tab name.

That's the whole job. A brand-new tab (e.g. `call_list_2026-07-22_marine-detailing`)
lands in the Google Sheet, sorted most-reviewed first, with `flag_low_reviews`
(<50 reviews) and `flag_no_website` columns, plus a blank `call_status` for the
owner to work.

## If something breaks

- **Missing env var** → the `.env` file isn't filled in. It needs `APIFY_TOKEN`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` (see `.env.example`).
- **Can't open the spreadsheet** → the Sheet must be shared as **Editor** with the
  service account's `client_email` (found inside `GOOGLE_SERVICE_ACCOUNT_JSON`).
- **Apify run failed** → check the run in https://console.apify.com. Try a broader
  search term or larger area.
- Don't retry the same failing command more than a couple times — tell the owner
  what went wrong.

## Owner note (you, the human)

Just open this repo in Claude Code, paste this file (or say "read RUN.md"), then
tell Claude your target. That's it. To change how thin listings get flagged, edit
`LOW_REVIEW_THRESHOLD` in `src/config.js`. Full details are in `README.md`.
