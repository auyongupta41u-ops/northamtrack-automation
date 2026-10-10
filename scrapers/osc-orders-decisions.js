/**
 * NORTHAMTRACK
 * OSC Orders, Rulings & Decisions
 * Full 2026 Extraction Test
 *
 * PURPOSE
 * -------
 * 1. Crawl OSC Orders, Rulings & Decisions
 * 2. Follow pagination
 * 3. Keep records published from 2026-01-01 onwards
 * 4. Extract listing metadata
 * 5. Visit each individual decision
 * 6. Extract the official OSC Headnote
 *
 * IMPORTANT
 * ---------
 * - NO Supabase writes
 * - NO AI processing
 * - Official Headnote is preserved separately
 */

const puppeteer = require("puppeteer");

const BASE_URL = "https://www.osc.ca";
const LISTING_URL =
  "https://www.osc.ca/en/securities-law/orders-rulings-and-decisions";

const CUTOFF_DATE = new Date("2026-01-01T00:00:00Z");

// Safety limit so a selector/pagination problem cannot cause an endless crawl.
const MAX_PAGES = 50;

function cleanText(value) {
  if (!value) return null;

  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(url) {
  if (!url) return null;

  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return null;
  }
}

function parseOSCDate(value) {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDate(date) {
  if (!date) return null;

  return date.toISOString().slice(0, 10);
}

async function configurePage(page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-CA,en;q=0.9"
  });

  page.setDefaultNavigationTimeout(60000);
}

async function extractListingPage(page, pageNumber) {
  const url =
    pageNumber === 0
      ? LISTING_URL
      : `${LISTING_URL}?page=${pageNumber}`;

  console.log("\n==================================================");
  console.log(`LISTING PAGE ${pageNumber + 1}`);
  console.log(url);
  console.log("==================================================");

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  console.log(
    "HTTP status:",
    response ? response.status() : "NO RESPONSE"
  );

  if (!response || response.status() >= 400) {
    throw new Error(
      `Unable to load listing page ${pageNumber + 1}.`
    );
  }

  const result = await page.evaluate(() => {
    const tidy = (text) =>
      text ? text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : null;

    const rows = Array.from(document.querySelectorAll("table tbody tr"));

    const records = rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length < 2) {
          return null;
        }

        const link = row.querySelector(
          'a[href*="/securities-law/orders-rulings-decisions/"]'
        );

        if (!link) {
          return null;
        }

        /*
         * OSC listing currently presents:
         *
         * Date
         * Title
         * Instrument
         * Document Type
         * Related to
         */

        return {
          published_date_text: tidy(cells[0]?.innerText),
          title: tidy(link.innerText) || tidy(cells[1]?.innerText),
          source_url: link.href,
          instrument: tidy(cells[2]?.innerText),
          document_type: tidy(cells[3]?.innerText),
          related_to: tidy(cells[4]?.innerText)
        };
      })
      .filter(Boolean);

    /*
     * Fallback:
     * If OSC changes the table markup, still collect decision links.
     * These records can then be identified in the logs rather than
     * silently returning nothing.
     */
    if (records.length === 0) {
      const links = Array.from(
        document.querySelectorAll(
          'a[href*="/securities-law/orders-rulings-decisions/"]'
        )
      );

      const unique = new Map();

      links.forEach((link) => {
        const title = tidy(link.innerText);

        if (!title || !link.href) return;

        if (!unique.has(link.href)) {
          unique.set(link.href, {
            published_date_text: null,
            title,
            source_url: link.href,
            instrument: null,
            document_type: null,
            related_to: null
          });
        }
      });

      return {
        records: Array.from(unique.values()),
        usedFallback: true
      };
    }

    return {
      records,
      usedFallback: false
    };
  });

  console.log("Records found:", result.records.length);

  if (result.usedFallback) {
    console.log(
      "WARNING: OSC table rows were not detected. Link fallback was used."
    );
  }

  return result.records;
}

async function extractHeadnote(browser, record, index, total) {
  const page = await browser.newPage();

  await configurePage(page);

  try {
    console.log(
      `\n[${index}/${total}] Opening: ${record.title}`
    );

    const response = await page.goto(record.source_url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const status = response ? response.status() : null;

    console.log("HTTP:", status || "NO RESPONSE");

    if (!response || status >= 400) {
      console.log("Could not open decision page.");

      return {
        ...record,
        headnote: null,
        headnote_found: false,
        raw_text: null,
        extraction_status: "PAGE_ERROR"
      };
    }

    const extracted = await page.evaluate(() => {
      const tidy = (text) =>
        text
          ? text
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : null;

      const bodyText = document.body?.innerText || "";

      /*
       * Find a heading whose text is exactly "Headnote".
       * Then collect content until the next comparable heading.
       */

      const headings = Array.from(
        document.querySelectorAll("h1, h2, h3, h4, h5, h6")
      );

      const headnoteHeading = headings.find(
        (heading) =>
          tidy(heading.innerText)?.toLowerCase() === "headnote"
      );

      let headnote = null;

      if (headnoteHeading) {
        const pieces = [];

        let node = headnoteHeading.nextElementSibling;

        while (node) {
          if (/^H[1-6]$/.test(node.tagName)) {
            break;
          }

          const text = tidy(node.innerText);

          if (text) {
            pieces.push(text);
          }

          node = node.nextElementSibling;
        }

        headnote = tidy(pieces.join(" "));
      }

      /*
       * Fallback for layouts where Headnote is not represented
       * as a normal heading element.
       */

      if (!headnote) {
        const match = bodyText.match(
          /Headnote\s+([\s\S]*?)(?=\n\s*(?:Statutes|Rules|Applicable|Representations|IN THE MATTER|AND IN THE MATTER|ORDER|DECISION|Reasons|Background)\b)/i
        );

        if (match && match[1]) {
          headnote = tidy(match[1]);
        }
      }

      return {
        headnote,
        raw_text: tidy(bodyText)
      };
    });

    console.log(
      "Headnote:",
      extracted.headnote
        ? `FOUND (${extracted.headnote.length} characters)`
        : "NOT FOUND"
    );

    return {
      ...record,
      headnote: extracted.headnote,
      headnote_found: Boolean(extracted.headnote),
      raw_text: extracted.raw_text,
      extraction_status: "SUCCESS"
    };
  } catch (error) {
    console.error(
      `Error processing ${record.source_url}:`,
      error.message
    );

    return {
      ...record,
      headnote: null,
      headnote_found: false,
      raw_text: null,
      extraction_status: "ERROR",
      extraction_error: error.message
    };
  } finally {
    await page.close();
  }
}

async function run() {
  console.log("==================================================");
  console.log("NORTHAMTRACK");
  console.log("OSC ORDERS, RULINGS & DECISIONS");
  console.log("2026 FULL EXTRACTION TEST");
  console.log("==================================================");

  console.log("Cutoff date: 2026-01-01");
  console.log("Supabase writes: DISABLED");
  console.log("AI analysis: DISABLED");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const listingPage = await browser.newPage();

    await configurePage(listingPage);

    const collected = new Map();

    let reachedPre2026 = false;

    for (
      let pageNumber = 0;
      pageNumber < MAX_PAGES;
      pageNumber++
    ) {
      const records = await extractListingPage(
        listingPage,
        pageNumber
      );

      if (records.length === 0) {
        console.log("No records found. Ending pagination.");
        break;
      }

      let datedRecordsOnPage = 0;
      let oldRecordsOnPage = 0;

      for (const record of records) {
        const parsedDate = parseOSCDate(
          record.published_date_text
        );

        if (!parsedDate) {
          console.log(
            `WARNING: Could not parse date for "${record.title}":`,
            record.published_date_text
          );

          continue;
        }

        datedRecordsOnPage++;

        if (parsedDate < CUTOFF_DATE) {
          oldRecordsOnPage++;
          continue;
        }

        const sourceUrl = absoluteUrl(record.source_url);

        if (!sourceUrl) {
          continue;
        }

        if (!collected.has(sourceUrl)) {
          collected.set(sourceUrl, {
            regulator: "OSC",
            jurisdiction: "Ontario, Canada",
            published_date: formatDate(parsedDate),
            title: cleanText(record.title),
            document_type: cleanText(record.document_type),
            instrument: cleanText(record.instrument),
            related_to: cleanText(record.related_to),
            source_url: sourceUrl,
            source_section: "ORDER_RULING_DECISION"
          });
        }
      }

      console.log(
        `2026+ records collected so far: ${collected.size}`
      );

      /*
       * OSC listing is newest first.
       * Once an entire dated page is older than the cutoff,
       * subsequent pages should also be older.
       */

      if (
        datedRecordsOnPage > 0 &&
        oldRecordsOnPage === datedRecordsOnPage
      ) {
        reachedPre2026 = true;

        console.log(
          "This page contains only pre-2026 dated records."
        );
        console.log("Stopping pagination.");

        break;
      }
    }

    await listingPage.close();

    const records = Array.from(collected.values()).sort(
      (a, b) =>
        new Date(b.published_date) -
        new Date(a.published_date)
    );

    console.log("\n==================================================");
    console.log("LISTING EXTRACTION COMPLETE");
    console.log("==================================================");

    console.log("Total unique 2026+ records:", records.length);
    console.log(
      "Reached records before cutoff:",
      reachedPre2026
    );

    if (records.length === 0) {
      throw new Error(
        "No 2026 OSC decisions were collected. Review listing selectors."
      );
    }

    console.log(
      "Newest record:",
      records[0].published_date,
      "-",
      records[0].title
    );

    console.log(
      "Oldest qualifying record:",
      records[records.length - 1].published_date,
      "-",
      records[records.length - 1].title
    );

    console.log("\n==================================================");
    console.log("HEADNOTE EXTRACTION");
    console.log("==================================================");

    const completed = [];

    for (let i = 0; i < records.length; i++) {
      const result = await extractHeadnote(
        browser,
        records[i],
        i + 1,
        records.length
      );

      completed.push(result);

      /*
       * Small delay to avoid hammering OSC.
       */
      await new Promise((resolve) =>
        setTimeout(resolve, 350)
      );
    }

    const headnotesFound = completed.filter(
      (item) => item.headnote_found
    ).length;

    const headnotesMissing =
      completed.length - headnotesFound;

    console.log("\n==================================================");
    console.log("FINAL EXTRACTION REPORT");
    console.log("==================================================");

    console.log("Total decisions:", completed.length);
    console.log("Headnotes found:", headnotesFound);
    console.log("Headnotes missing:", headnotesMissing);

    console.log("\nDOCUMENT TYPES");

    const documentTypes = {};

    completed.forEach((item) => {
      const type = item.document_type || "UNKNOWN";

      documentTypes[type] =
        (documentTypes[type] || 0) + 1;
    });

    console.log(documentTypes);

    console.log("\nDECISIONS WITHOUT HEADNOTES");

    const missing = completed.filter(
      (item) => !item.headnote_found
    );

    if (missing.length === 0) {
      console.log("None");
    } else {
      missing.forEach((item) => {
        console.log(
          `${item.published_date} | ${item.title} | ${item.source_url}`
        );
      });
    }

    /*
     * Print a compact machine-readable dataset.
     * raw_text is intentionally excluded here because it can make
     * GitHub Actions logs extremely large.
     */

    const output = completed.map((item) => ({
      regulator: item.regulator,
      jurisdiction: item.jurisdiction,
      published_date: item.published_date,
      title: item.title,
      document_type: item.document_type,
      instrument: item.instrument,
      related_to: item.related_to,
      headnote: item.headnote,
      source_url: item.source_url,
      source_section: item.source_section,
      extraction_status: item.extraction_status
    }));

    console.log("\n==================================================");
    console.log("EXTRACTED DATASET");
    console.log("==================================================");

    console.log(JSON.stringify(output, null, 2));

    console.log("\n==================================================");
    console.log("OSC 2026 EXTRACTION COMPLETED");
    console.log("NO DATABASE CHANGES WERE MADE");
    console.log("==================================================");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("\nOSC EXTRACTION FAILED");
  console.error(error);

  process.exit(1);
});
