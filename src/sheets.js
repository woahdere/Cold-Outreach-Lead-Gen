// sheets.js — write the call list to Google Sheets via service-account auth.
//
// Each session writes its OWN date/target-stamped tab (e.g.
// "call_list_2026-07-14_pinellas") so past sessions are preserved rather than
// overwritten. The tab + header row are created automatically if missing.
//
// SETUP (documented fully in README):
//   1. Create a Google service account, download its JSON key.
//   2. Enable BOTH the Google Sheets API and the Google Drive API.
//   3. Share the target Sheet with the service account's client_email as Editor.

import { google } from "googleapis";
import { config } from "./config.js";

// Column order for the call_list tab — must match rowFromLead() below.
export const HEADERS = [
  "business_name",
  "phone",
  "website",
  "category",
  "rating",
  "review_count",
  "flag_low_reviews", // "YES" if under the low-review threshold (default <50)
  "flag_no_website", // "YES" if the listing has no website
  "call_status", // left blank for the owner: Called / Voicemail / Booked / Not interested
];

/** Build an authenticated Sheets API client from the service-account JSON. */
function getSheetsClient() {
  let credentials;
  try {
    credentials = JSON.parse(config.googleServiceAccountJson);
  } catch (err) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. It must be the entire key ` +
        `file contents on one line. Parse error: ${err.message}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Build a clean, filesystem/tab-safe tab name from the session date + target.
 * e.g. buildTabName("Pinellas County") -> "call_list_2026-07-22_pinellas-county"
 */
export function buildTabName(targetLabel) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = String(targetLabel || "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  let name = `call_list_${date}_${slug}`;
  // Google caps sheet/tab names at 100 chars.
  return name.slice(0, 100);
}

/** Convert one flagged lead into a sheet row, in HEADERS order. */
function rowFromLead(lead) {
  return [
    lead.name,
    lead.phone,
    lead.website,
    lead.category,
    lead.rating,
    lead.reviewCount,
    lead.flag_low_reviews || "",
    lead.flag_no_website || "",
    "", // call_status — owner fills this in
  ];
}

/**
 * Write the sorted call list to a fresh tab.
 *
 * @param {object[]} leads - flagged, already sorted best-first. Each lead has
 *        name, phone, website, category, rating, reviewCount, flag_low_reviews,
 *        flag_no_website.
 * @param {string} targetLabel - short human label for the session (used in tab name).
 * @returns {Promise<{tabName:string, rowsWritten:number, url:string}>}
 */
export async function writeCallList(leads, targetLabel) {
  const sheets = getSheetsClient();
  const spreadsheetId = config.googleSheetId;
  const tabName = buildTabName(targetLabel);

  // 1. Confirm we can reach the spreadsheet, and learn existing tab names.
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId });
  } catch (err) {
    throw new Error(
      `[sheets] cannot open spreadsheet ${spreadsheetId}. Is GOOGLE_SHEET_ID ` +
        `correct, and is the sheet shared with the service account's ` +
        `client_email as Editor? Underlying error: ${err.message}`
    );
  }

  const existingTitles = (meta.data.sheets || []).map((s) => s.properties.title);

  // If a tab with this exact name already exists (re-run same day + target),
  // suffix it so we never overwrite a previous session's list.
  let finalTabName = tabName;
  let n = 2;
  while (existingTitles.includes(finalTabName)) {
    finalTabName = `${tabName}-${n++}`.slice(0, 100);
  }

  // 2. Create the new tab.
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: finalTabName } } }],
      },
    });
  } catch (err) {
    throw new Error(`[sheets] failed to create tab "${finalTabName}": ${err.message}`);
  }

  // 3. Write header + rows.
  const values = [HEADERS, ...leads.map(rowFromLead)];
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${finalTabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  } catch (err) {
    throw new Error(`[sheets] failed to write rows to "${finalTabName}": ${err.message}`);
  }

  // 4. Bold the header row (nice-to-have; ignore failures).
  try {
    const sheetId = await getSheetIdByTitle(sheets, spreadsheetId, finalTabName);
    if (sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: "userEnteredFormat.textFormat.bold",
              },
            },
            { updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
            } },
          ],
        },
      });
    }
  } catch {
    /* cosmetic only — safe to ignore */
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=`;
  return { tabName: finalTabName, rowsWritten: leads.length, url };
}

async function getSheetIdByTitle(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = (meta.data.sheets || []).find((s) => s.properties.title === title);
  return found ? found.properties.sheetId : null;
}
