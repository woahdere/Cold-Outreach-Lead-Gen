// ─────────────────────────────────────────────────────────────────────────────
// index.js — orchestrates one on-demand call-list build.
//
// Run from Claude Code: the owner describes the target in conversation, Claude
// fills in the targeting below (or calls buildCallList directly), and this runs:
//
//   scrape → floor at 10 reviews → score + sort → cap at 100 →
//   Claude signal + opener per lead → write a fresh Google Sheet tab → log summary.
//
// This tool BUILDS THE LIST ONLY. It does not place calls.
// ─────────────────────────────────────────────────────────────────────────────

import { MIN_REVIEWS, MAX_LEADS } from "./config.js";
import { runScrape } from "./apify.js";
import { normalizeLead, scoreLead } from "./scoring.js";
import { generateOpenersForLeads } from "./claudeAgent.js";
import { writeCallList } from "./sheets.js";

// ── SESSION TARGETING ─────────────────────────────────────────────────────────
// When run directly (npm start), these values drive the session. In Claude Code,
// Claude edits these per session (or calls buildCallList() below with its own
// arguments). Kept right at the top so targeting is never buried in code.
const SESSION = {
  // What to search on Google Maps. String or array of strings.
  searchTerms: "marine detailing",
  // Area to search.
  location: "Pinellas County, Florida",
  // How many places to ASK the scraper for. Some will fall below the review
  // floor, so request more than the number of calls you want (e.g. 60–150).
  desiredResults: 60,
  // Short human label used in the sheet tab name (date is added automatically).
  targetLabel: "pinellas marine detailing",
};

/**
 * The whole run. Exported so Claude Code (or a test) can call it with explicit
 * targeting instead of editing the SESSION constant.
 *
 * @param {object} targeting
 * @param {string|string[]} targeting.searchTerms
 * @param {string} targeting.location
 * @param {number} targeting.desiredResults
 * @param {string} targeting.targetLabel
 */
export async function buildCallList({
  searchTerms,
  location,
  desiredResults,
  targetLabel,
}) {
  console.log("\n=== Cold Outreach — call-list build ===");
  console.log(
    `Target: ${JSON.stringify(searchTerms)} in "${location}" | ` +
      `requesting ~${desiredResults} places\n`
  );

  // 1–3. Launch a LIVE scrape and pull the dataset items.
  const rawItems = await runScrape({
    searchTerms,
    location,
    maxResults: desiredResults,
  });
  const totalScraped = rawItems.length;

  // Keywords used for the category-match scoring bonus.
  const targetKeywords = (Array.isArray(searchTerms) ? searchTerms : [searchTerms])
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // 4–5. Normalize, apply the hard 10-review floor, score everything above it.
  // NO filtering beyond the floor — every qualifier stays, ranked best-first.
  let belowFloor = 0;
  const qualified = [];
  for (const raw of rawItems) {
    let lead;
    try {
      lead = normalizeLead(raw);
      const score = scoreLead(lead, targetKeywords);
      if (score === null) {
        belowFloor++; // below the 10-review floor → excluded
        continue;
      }
      qualified.push({ ...lead, score });
    } catch (err) {
      // One malformed item never crashes the run.
      console.warn(`[index] skipped a malformed scrape item: ${err.message}`);
    }
  }

  // Sort best-first by score.
  qualified.sort((a, b) => b.score - a.score);

  // 6. Cap at the top MAX_LEADS by score.
  const cappedOff = Math.max(0, qualified.length - MAX_LEADS);
  const kept = qualified.slice(0, MAX_LEADS);

  if (kept.length === 0) {
    console.log(
      `\nNo qualifying leads (≥ ${MIN_REVIEWS} reviews) out of ${totalScraped} scraped. ` +
        `Nothing written. Try a broader search term or a larger area.`
    );
    return { totalScraped, belowFloor, qualified: 0, written: 0, cappedOff: 0 };
  }

  // 7. One Claude call per kept lead → { signal, call_opener }.
  console.log(
    `\n[index] generating signal + call opener for ${kept.length} leads via Claude...`
  );
  const openers = await generateOpenersForLeads(kept);
  kept.forEach((lead, i) => {
    lead.signal = openers[i].signal;
    lead.call_opener = openers[i].call_opener;
  });

  // 8. Write the fresh, best-first call_list tab.
  console.log(`\n[index] writing ${kept.length} leads to Google Sheets...`);
  const { tabName, rowsWritten, url } = await writeCallList(kept, targetLabel);

  // 9. Run summary.
  console.log("\n=== RUN SUMMARY ===");
  console.log(`  Total scraped:        ${totalScraped}`);
  console.log(`  Below ${MIN_REVIEWS}-review floor: ${belowFloor} (excluded)`);
  console.log(`  Qualified:            ${qualified.length}`);
  console.log(`  Written to sheet:     ${rowsWritten}`);
  console.log(`  Capped off (> ${MAX_LEADS}):  ${cappedOff}`);
  console.log(`  Sheet tab:            ${tabName}`);
  console.log(`  Open the sheet:       ${url}`);
  console.log("===================\n");

  // DIALING STEP — intentionally not implemented.
  // This tool builds the list only; the owner works the sheet by hand.

  return {
    totalScraped,
    belowFloor,
    qualified: qualified.length,
    written: rowsWritten,
    cappedOff,
    tabName,
  };
}

// Run directly with `npm start`, using the SESSION constant above.
// (import.meta check keeps this from firing if the module is imported elsewhere.)
const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  buildCallList(SESSION).catch((err) => {
    console.error(`\n[FATAL] run failed: ${err.message}\n`);
    process.exitCode = 1;
  });
}
