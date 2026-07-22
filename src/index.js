// ─────────────────────────────────────────────────────────────────────────────
// index.js — orchestrates one on-demand call-list build.
//
// Run from Claude Code: the owner describes the target in conversation, Claude
// fills in the targeting below (or calls buildCallList directly), and this runs:
//
//   scrape → normalize → flag (<50 reviews, no website) →
//   sort by review count → cap at 100 → write a fresh Google Sheet tab → summary.
//
// No scoring model and no AI. This tool BUILDS THE LIST ONLY. It does not call.
// ─────────────────────────────────────────────────────────────────────────────

import { LOW_REVIEW_THRESHOLD, MAX_LEADS } from "./config.js";
import { runScrape } from "./apify.js";
import { normalizeLead, flagLead, sortLeads } from "./leads.js";
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
  // How many places to ASK the scraper for.
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

  // 4. Normalize + flag every business. Nothing is dropped for review count —
  //    low-review and no-website listings are flagged, not removed.
  const flagged = [];
  for (const raw of rawItems) {
    try {
      flagged.push(flagLead(normalizeLead(raw)));
    } catch (err) {
      // One malformed item never crashes the run.
      console.warn(`[index] skipped a malformed scrape item: ${err.message}`);
    }
  }

  // 5. Sort best-first (most reviews first), then cap at the top MAX_LEADS.
  const sorted = sortLeads(flagged);
  const cappedOff = Math.max(0, sorted.length - MAX_LEADS);
  const kept = sorted.slice(0, MAX_LEADS);

  if (kept.length === 0) {
    console.log(
      `\nNo businesses returned for that target. Nothing written. ` +
        `Try a broader search term or a larger area.`
    );
    return { totalScraped, written: 0, lowReviews: 0, noWebsite: 0, cappedOff: 0 };
  }

  // Tallies for the summary.
  const lowReviews = kept.filter((l) => l.flag_low_reviews === "YES").length;
  const noWebsite = kept.filter((l) => l.flag_no_website === "YES").length;

  // 6. Write the fresh, sorted call_list tab.
  console.log(`\n[index] writing ${kept.length} leads to Google Sheets...`);
  const { tabName, rowsWritten, url } = await writeCallList(kept, targetLabel);

  // 7. Run summary.
  console.log("\n=== RUN SUMMARY ===");
  console.log(`  Total scraped:            ${totalScraped}`);
  console.log(`  Written to sheet:         ${rowsWritten}`);
  console.log(`  Flagged low reviews (<${LOW_REVIEW_THRESHOLD}): ${lowReviews}`);
  console.log(`  Flagged no website:       ${noWebsite}`);
  console.log(`  Capped off (> ${MAX_LEADS}):      ${cappedOff}`);
  console.log(`  Sheet tab:                ${tabName}`);
  console.log(`  Open the sheet:           ${url}`);
  console.log("===================\n");

  // DIALING STEP — intentionally not implemented.
  // This tool builds the list only; the owner works the sheet by hand.

  return {
    totalScraped,
    written: rowsWritten,
    lowReviews,
    noWebsite,
    cappedOff,
    tabName,
  };
}

/**
 * Parse simple --flag value command-line args so a session can be launched with
 * one command, no code editing:
 *   npm start -- --search "marine detailing" --location "Pinellas County, FL" --count 60
 * Any flag left out falls back to the SESSION defaults above.
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--search": out.searchTerms = next(); break;
      case "--location": out.location = next(); break;
      case "--count": out.desiredResults = Number(next()); break;
      case "--label": out.targetLabel = next(); break;
    }
  }
  return out;
}

// Run directly with `npm start` (flags optional; falls back to SESSION above).
// (import.meta check keeps this from firing if the module is imported elsewhere.)
const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const cli = parseArgs(process.argv.slice(2));
  const session = { ...SESSION, ...cli };
  // If a search was given on the command line but no label, derive a sensible one.
  if (cli.searchTerms && !cli.targetLabel) {
    session.targetLabel = `${cli.searchTerms} ${cli.location || ""}`.trim();
  }
  buildCallList(session).catch((err) => {
    console.error(`\n[FATAL] run failed: ${err.message}\n`);
    process.exitCode = 1;
  });
}
