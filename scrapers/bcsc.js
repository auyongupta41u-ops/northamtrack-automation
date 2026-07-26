const puppeteer = require("puppeteer");

const {
  upsertRegulatoryUpdates
} = require("../services/database");

const NEWS_URL =
  "https://www.bcsc.bc.ca/about/media-room/news-releases";

async function scrapeBCSCLinks() {
  let browser;

  try {
    console.log(
      "Opening the BCSC news releases page in a browser..."
    );

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (compatible; NorthAmTrack Regulatory Monitor/1.0)"
    );

    await page.goto(NEWS_URL, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    /*
     * Wait until the JavaScript-rendered BCSC page contains
     * at least one news-release link.
     */
    await page.waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll("a")
        ).some((link) =>
          link.href.includes(
            "/about/media-room/news-releases/"
          )
        ),
      {
        timeout: 30000
      }
    );

    /*
     * Extract and deduplicate news-release links from
     * the BCSC listing page.
     */
    const releases = await page.evaluate(() => {
      const seenUrls = new Set();

      return Array.from(
        document.querySelectorAll("a[href]")
      )
        .map((link) => {
          const container =
            link.closest("article") ||
            link.closest("li") ||
            link.closest("div");

          const title = link.textContent
            .replace(/\s+/g, " ")
            .trim();

          const dateElement =
            container?.querySelector("time") ||
            container?.querySelector(".date") ||
            container?.querySelector(
              '[class*="date"]'
            );

          const summaryElement =
            container?.querySelector("p") ||
            container?.querySelector(
              ".description"
            ) ||
            container?.querySelector(
              '[class*="description"]'
            );

          return {
            title,
            source_url: link.href,

            published_date:
              dateElement?.getAttribute(
                "datetime"
              ) ||
              dateElement?.textContent
                ?.replace(/\s+/g, " ")
                .trim() ||
              "",

            summary_text:
              summaryElement?.textContent
                ?.replace(/\s+/g, " ")
                .trim() ||
              ""
          };
        })
        .filter((release) => {
          const isNewsRelease =
            release.title &&
            release.source_url.includes(
              "/about/media-room/news-releases/"
            );

          /*
           * Exclude the main listing page itself.
           */
          const isListingPage =
            release.source_url.replace(
              /\/$/,
              ""
            ) ===
            "https://www.bcsc.bc.ca/about/media-room/news-releases";

          if (
            !isNewsRelease ||
            isListingPage ||
            seenUrls.has(release.source_url)
          ) {
            return false;
          }

          seenUrls.add(release.source_url);
          return true;
        });
    });

    console.log(
      `Found ${releases.length} possible BCSC news releases.`
    );

    /*
     * Display the first 10 releases in the GitHub Actions log.
     */
    releases
      .slice(0, 10)
      .forEach((release, index) => {
        console.log(
          `\n${index + 1}. ${release.title}`
        );

        console.log(
          `   Date: ${
            release.published_date ||
            "Not found"
          }`
        );

        console.log(
          `   Summary: ${
            release.summary_text ||
            "Not found"
          }`
        );

        console.log(
          `   URL: ${release.source_url}`
        );
      });

    if (releases.length === 0) {
      throw new Error(
        "No BCSC news-release links were found."
      );
    }

    /*
     * Convert the BCSC scraper output into the exact
     * structure expected by services/database.js and
     * the regulatory_updates Supabase table.
     *
     * This initial version processes a maximum of
     * 10 releases per run.
     */
    const items = releases
      .slice(0, 10)
      .map((release) => {
        const fallbackText =
          `BCSC news release: ${release.title}`;

        /*
         * The listing page currently does not reliably
         * provide dates. The current timestamp is used
         * temporarily until article-page extraction is added.
         */
        let publishedDate =
          new Date().toISOString();

        if (release.published_date) {
          const parsedDate = new Date(
            release.published_date
          );

          if (!Number.isNaN(parsedDate.getTime())) {
            publishedDate =
              parsedDate.toISOString();
          }
        }

        return {
          title: release.title,

          summary:
            release.summary_text ||
            fallbackText,

          full_text:
            release.summary_text ||
            fallbackText,

          source_url:
            release.source_url,

          published_date:
            publishedDate,

          regulator: "BCSC",

          regulator_name:
            "British Columbia Securities Commission",

          regulator_country:
            "Canada",

          category: "news",

          impact_rating: "LOW",

          mutual_fund_relevance:
            0.45,

          why_it_matters:
            "This BCSC update may affect securities regulation, compliance obligations, market conduct or investor-protection requirements in British Columbia. Firms should review the complete release and assess whether it applies to their Canadian operations.",

          actions_needed:
            "1. Review the complete BCSC release\n" +
            "2. Assess relevance to Canadian operations\n" +
            "3. Identify any compliance or disclosure implications\n" +
            "4. Monitor related BCSC or CSA guidance",

          tags: [
            "BCSC",
            "News Release"
          ],

          summarization_version:
            "1.0"
        };
      });

    console.log(
      `\nSending ${items.length} BCSC records to Supabase...`
    );

    const result =
      await upsertRegulatoryUpdates(items);

    console.log(
      "\nBCSC Supabase result:"
    );

    console.log(
      `Inserted: ${result.inserted}`
    );

    console.log(
      `Updated: ${result.updated}`
    );

    console.log(
      `Failed: ${result.failed}`
    );

    if (result.failed > 0) {
      throw new Error(
        `${result.failed} BCSC records failed to save to Supabase.`
      );
    }

    console.log(
      "\nBCSC scraping and Supabase upsert completed successfully."
    );
  } catch (error) {
    console.error(
      "BCSC extraction failed."
    );

    console.error(error.message);

    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeBCSCLinks();
