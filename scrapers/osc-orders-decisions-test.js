/**
 * NORTHAMTRACK
 * OSC Orders, Rulings & Decisions
 * Diagnostic Test
 *
 * PURPOSE:
 * 1. Test access to OSC Orders, Rulings & Decisions listing
 * 2. Find links to individual decisions
 * 3. Test access to an individual OSC decision
 * 4. Test Headnote extraction
 *
 * NO Supabase writes
 * NO AI processing
 */

const puppeteer = require("puppeteer");

const LISTING_URL =
  "https://www.osc.ca/en/securities-law/orders-rulings-and-decisions";

const SAMPLE_URL =
  "https://www.osc.ca/en/securities-law/orders-rulings-decisions/blackrock-asset-management-canada-limited-14";

async function runTest() {
  console.log("==============================================");
  console.log("NORTHAMTRACK — OSC ORDERS & DECISIONS TEST");
  console.log("==============================================");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-CA,en;q=0.9"
    });

    page.setDefaultNavigationTimeout(60000);

    // --------------------------------------------------
    // TEST 1 — OSC LISTING PAGE
    // --------------------------------------------------

    console.log("\nTEST 1 — Opening OSC listing page...");

    const listingResponse = await page.goto(LISTING_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log(
      "Listing HTTP status:",
      listingResponse ? listingResponse.status() : "NO RESPONSE"
    );

    console.log("Listing title:", await page.title());

    const listingResults = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";

      const links = Array.from(
        document.querySelectorAll("a[href]")
      )
        .map(a => ({
          title: (a.innerText || "").trim(),
          url: a.href
        }))
        .filter(item =>
          item.url.includes(
            "/securities-law/orders-rulings-decisions/"
          )
        );

      return {
        bodyLength: bodyText.length,
        linksFound: links.length,
        first10Links: links.slice(0, 10)
      };
    });

    console.log("\nLISTING RESULTS");
    console.log(JSON.stringify(listingResults, null, 2));

    // --------------------------------------------------
    // TEST 2 — INDIVIDUAL DECISION
    // --------------------------------------------------

    console.log("\nTEST 2 — Opening sample BlackRock decision...");

    const decisionResponse = await page.goto(SAMPLE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log(
      "Decision HTTP status:",
      decisionResponse ? decisionResponse.status() : "NO RESPONSE"
    );

    console.log("Decision title:", await page.title());

    // --------------------------------------------------
    // TEST 3 — HEADNOTE
    // --------------------------------------------------

    console.log("\nTEST 3 — Looking for Headnote...");

    const decisionResults = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";

      const headnoteIndex = bodyText.search(/\bHeadnote\b/i);

      if (headnoteIndex === -1) {
        return {
          headnoteFound: false,
          pageTextLength: bodyText.length,
          first1000Characters: bodyText.slice(0, 1000)
        };
      }

      const afterHeadnote = bodyText.substring(
        headnoteIndex + "Headnote".length
      );

      const possibleEnd = afterHeadnote.search(
        /\n\s*(?:Applicable Legislative Provisions|Applicable Instruments|Statutes|Rules|Decision|Order)\s*\n/i
      );

      const headnote =
        possibleEnd >= 0
          ? afterHeadnote.substring(0, possibleEnd)
          : afterHeadnote.substring(0, 5000);

      return {
        headnoteFound: true,
        headnoteLength: headnote.trim().length,
        headnote: headnote.trim()
      };
    });

    console.log("\nHEADNOTE RESULTS");
    console.log(JSON.stringify(decisionResults, null, 2));

    console.log("\n==============================================");
    console.log("OSC DIAGNOSTIC TEST COMPLETED");
    console.log("==============================================");

  } catch (error) {
    console.error("\nOSC TEST FAILED");
    console.error(error);
    process.exitCode = 1;

  } finally {
    await browser.close();
  }
}

runTest();
