/**
 * NORTHAMTRACK
 * OSC Orders, Rulings & Decisions
 * LISTING STRUCTURE DIAGNOSTIC
 *
 * PURPOSE:
 * Discover exactly how OSC exposes:
 * - Date
 * - Title
 * - Instrument
 * - Document Type
 * - Related To
 *
 * NO Supabase writes
 * NO AI processing
 */

const puppeteer = require("puppeteer");

const LISTING_URL =
  "https://www.osc.ca/en/securities-law/orders-rulings-and-decisions";

async function runTest() {
  console.log("==============================================");
  console.log("NORTHAMTRACK — OSC LISTING STRUCTURE TEST");
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

    console.log("\nOpening OSC listing page...");

    const response = await page.goto(LISTING_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log(
      "HTTP status:",
      response ? response.status() : "NO RESPONSE"
    );

    const results = await page.evaluate(() => {
      const tidy = (value) =>
        value
          ? value
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : null;

      const links = Array.from(
        document.querySelectorAll(
          'a[href*="/securities-law/orders-rulings-decisions/"]'
        )
      ).filter((link) => {
        try {
          const url = new URL(link.href);

          const path =
            url.pathname.replace(/\/+$/, "");

          return (
            path.startsWith(
              "/en/securities-law/orders-rulings-decisions/"
            ) &&
            path !==
              "/en/securities-law/orders-rulings-decisions"
          );
        } catch {
          return false;
        }
      });

      const unique = [];
      const seen = new Set();

      for (const link of links) {
        if (seen.has(link.href)) {
          continue;
        }

        seen.add(link.href);

        /*
         * Walk UP the DOM from the decision link.
         * This lets us see which ancestor contains
         * Date / Instrument / Document Type / Related To.
         */

        const ancestors = [];

        let node = link;

        for (
          let level = 0;
          level < 8 && node;
          level++
        ) {
          ancestors.push({
            level,

            tag:
              node.tagName || null,

            className:
              typeof node.className === "string"
                ? node.className
                : null,

            id:
              node.id || null,

            text:
              tidy(node.innerText),

            html:
              node.outerHTML
                ? node.outerHTML.slice(0, 3000)
                : null
          });

          node = node.parentElement;
        }

        unique.push({
          title:
            tidy(link.innerText),

          url:
            link.href,

          ancestors
        });

        /*
         * We only need the first 3 decisions.
         */
        if (unique.length >= 3) {
          break;
        }
      }

      return {
        decisionLinksFound:
          links.length,

        samples:
          unique
      };
    });

    console.log("\n==============================================");
    console.log("OSC LISTING STRUCTURE RESULTS");
    console.log("==============================================");

    console.log(
      JSON.stringify(results, null, 2)
    );

    console.log("\n==============================================");
    console.log("DIAGNOSTIC COMPLETED");
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
