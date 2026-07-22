// apify.js — LAUNCH a fresh Google Maps scrape each run, wait for it, pull items.
//
// The key behavior: every call starts a NEW actor run with dynamic input built
// from the session's targeting. We never read a hardcoded/pre-existing dataset.
//
// REQUIRED FIELDS the scrape must return (the call list is blind without them):
//   business name, phone, website, category, rating, REVIEW COUNT.
// The default actor (compass/crawler-google-places) returns all of these. If you
// swap APIFY_ACTOR_ID to a different scraper, confirm it still returns them —
// especially review count, which the low-review flag depends on.

import { ApifyClient } from "apify-client";
import { config } from "./config.js";

/**
 * Launch a live Apify scrape and return the raw dataset items.
 *
 * @param {object} targeting
 * @param {string|string[]} targeting.searchTerms - what to search, e.g.
 *        "marine detailing" or ["boat detailing", "yacht cleaning"].
 * @param {string} targeting.location - area to search, e.g. "Pinellas County, Florida".
 * @param {number} targeting.maxResults - how many places to request from the scraper.
 * @returns {Promise<object[]>} raw dataset items (un-normalized).
 */
export async function runScrape({ searchTerms, location, maxResults }) {
  const client = new ApifyClient({ token: config.apifyToken });

  const searchStringsArray = Array.isArray(searchTerms)
    ? searchTerms
    : [searchTerms];

  // Actor input for compass/crawler-google-places. These field names are that
  // actor's schema; if you swap actors, adjust this input object to match.
  const input = {
    searchStringsArray,
    locationQuery: location,
    maxCrawledPlacesPerSearch: maxResults,
    language: "en",
    // Ask only for what we score/pitch on — keeps runs cheaper and faster.
    scrapePlaceDetailPage: false,
    skipClosedPlaces: true,
    // We do NOT need reviews text, images, or contact enrichment for a call list.
    maxReviews: 0,
    maxImages: 0,
  };

  console.log(
    `[apify] launching actor "${config.apifyActorId}" — ` +
      `search=${JSON.stringify(searchStringsArray)} location="${location}" ` +
      `maxResults=${maxResults}`
  );

  let run;
  try {
    // "Run actor and WAIT for finish", then we read its dataset.
    run = await client.actor(config.apifyActorId).call(input);
  } catch (err) {
    throw new Error(
      `[apify] failed to launch or complete the actor run: ${err.message}`
    );
  }

  if (!run || run.status !== "SUCCEEDED") {
    throw new Error(
      `[apify] actor run did not succeed (status: ${run?.status || "unknown"}). ` +
        `Check the run in the Apify console: https://console.apify.com/`
    );
  }

  if (!run.defaultDatasetId) {
    throw new Error("[apify] run finished but returned no dataset id.");
  }

  console.log(
    `[apify] run ${run.id} SUCCEEDED. Fetching dataset ${run.defaultDatasetId}...`
  );

  let items;
  try {
    const dataset = await client.dataset(run.defaultDatasetId).listItems();
    items = dataset.items || [];
  } catch (err) {
    throw new Error(`[apify] failed to fetch dataset items: ${err.message}`);
  }

  console.log(`[apify] pulled ${items.length} raw items from the dataset.`);
  return items;
}
