# Cold Outreach — Call List Generator

An **on-demand** tool that builds a ready-to-work cold-call list for a single
calling session. You sit down before a session, tell Claude who to target, and
the tool launches a fresh Google Maps scrape, flags the weak-looking listings,
sorts by review count, and drops a clean call list into your Google Sheet.

You never touch the code. **Claude Code is the interface.**

> This build makes the **call list only**. It does not dial anyone, and it is not
> an email tool. The email pipeline is a separate, future build.

---

## 1. How to run a session

1. Open this repo's folder in **Claude Code**.
2. Tell Claude your target in plain English, for example:

   > "Build a call list for marine detailing businesses in Pinellas County, about 60 leads."

3. Claude sets the targeting, launches the scrape, waits for it, sorts and flags
   everything, and saves a new tab in your Google Sheet.
4. Claude prints a short **run summary** and tells you the tab name. Open the
   Sheet and start dialing.

You decide the target live, in conversation, every time — nothing is scheduled
and nothing is read from a fixed settings file.

### What happens under the hood

```
scrape Google Maps  →  normalize the business info  →  flag <50 reviews & no website
   →  sort most-reviewed first  →  keep the top 100
   →  write a fresh, dated tab in your Google Sheet  →  print a summary
```

No scoring model and no AI writing — just clean business info and two flags so
you can eyeball or filter the list and personalize your own openers on the call.

---

## 2. The three secrets (one-time setup)

These live in a file named `.env` (copied from `.env.example`). The `.env` file is
**never** shared or committed. Fill in these three values:

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `APIFY_TOKEN` | Lets the tool run the Google Maps scrape | [console.apify.com](https://console.apify.com/) → Settings → Integrations → API token |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | A Google "robot account" key, so the tool can write your Sheet | See Google setup below |
| `GOOGLE_SHEET_ID` | Which Sheet to write to | The long ID in your Sheet's URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit` |

### Google setup (do this once)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   **service account** and **download its JSON key file**.
2. Enable **both** the **Google Sheets API** and the **Google Drive API** for that
   project.
3. Open the JSON key file, find the `client_email` (looks like
   `something@your-project.iam.gserviceaccount.com`), and **share your Google
   Sheet with that email address as an Editor** — exactly like sharing a Sheet
   with a coworker. This is the step people forget; without it, writing fails.
4. Put the **entire contents** of that JSON key file, on a single line, as the
   value of `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env`.
   - Quick way to flatten it to one line: `cat your-key.json | tr -d '\n'`

> If you get stuck on any of this, just ask Claude in Claude Code — it can walk
> you through each step.

### Installing (one time)

In Claude Code, ask it to run the install, or run this yourself in the terminal:

```
npm install
```

---

## 3. The scraper (what you're paying for)

The default scraper is Apify's **`compass/crawler-google-places`** — a reliable
Google Maps business scraper. You pay Apify per run based on how many places it
pulls. Requesting ~60–150 places per session is typical and cheap.

The scrape returns: **business name, phone, website, category, rating, and review
count.** (Google Maps listings do **not** include email addresses, so email is not
in the list — getting emails would require separately crawling each business's
website, which is a future add-on.) If you ever swap to a different scraper (by
setting `APIFY_ACTOR_ID` in `.env`), make sure it still returns those fields.

---

## 4. Tuning

There's almost nothing to tune — that's the point. The one knob lives in
**`src/config.js`**:

- **`LOW_REVIEW_THRESHOLD`** (default `50`) — any business with fewer than this
  many reviews gets a `YES` in the `flag_low_reviews` column. Nothing is dropped;
  it's just flagged so you can spot or filter thin listings.
- **`MAX_LEADS`** (default `100`) — the most rows written per session. Results are
  sorted most-reviewed first, so the cap keeps the busiest businesses.

Change a number, save the file, run the next session — done.

---

## 5. Reading the results

Each session writes a **brand-new tab** to your Sheet, named with the date and
target, e.g. `call_list_2026-07-22_pinellas-marine-detailing`. Past sessions are
never overwritten — you keep a full history.

The tab has these columns, sorted most-reviewed first:

| Column | What it is |
| --- | --- |
| `business_name` | Who to call |
| `phone` | The number to dial |
| `website` | Their site, if any |
| `category` | Their business category / service type |
| `rating` | Star rating |
| `review_count` | Number of reviews |
| `flag_low_reviews` | `YES` if under 50 reviews (thin listing) |
| `flag_no_website` | `YES` if they have no website |
| `call_status` | **You fill this in:** Called / Voicemail / Booked / Not interested |

Tip: in Google Sheets you can turn on a filter (Data → Create a filter) and, for
example, show only rows where `flag_no_website` = `YES` if that's your pitch.

After each run, Claude prints a summary:

- **Total scraped** — how many businesses the scrape returned
- **Written to sheet** — how many are in your call list
- **Flagged low reviews** — how many have under 50 reviews
- **Flagged no website** — how many have no website
- **Capped off** — if more than 100 came back, how many were left off (run again
  with a tighter target to reach them)

---

## 6. Notes

- **Dialing is manual.** The tool builds the list; you work the sheet. There is a
  clearly-marked `// DIALING STEP — intentionally not implemented` placeholder in
  the code for a future build.
- **This is the call-list build only.** The email pipeline is separate and not
  included here.
- **Secrets are safe.** `.env` and downloaded key files are gitignored and never
  committed.
