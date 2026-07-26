
const puppeteer = require("puppeteer");

const NEWS_URL =
  "https://www.securities-administrators.ca/news/";

async function scrapeCSALinks() {
  let browser;

  try {
    console.log(
      "Opening the official CSA news page..."
    );

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
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

    await page.waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll("a[href]")
        ).some((link) =>
          link.href.includes(
            "securities-administrators.ca/news/"
          )
        ),
      {
        timeout: 30000
      }
    );

    const releases = await page.evaluate(() => {
      const seenUrls = new Set();

      return Array.from(
        document.querySelectorAll("a[href]")
      )
        .map((link) => ({
          title: link.textContent
            .replace(/\s+/g, " ")
            .trim(),

          source_url: link.href
        }))
        .filter((release) => {
          const normalizedUrl =
            release.source_url.replace(/\/$/, "");

          const listingUrl =
            "https://www.securities-administrators.ca/news";

          const isArticle =
            release.title.length >= 20 &&
            normalizedUrl.startsWith(
              `${listingUrl}/`
            ) &&
            normalizedUrl !== listingUrl;

          if (
            !isArticle ||
            seenUrls.has(normalizedUrl)
          ) {
            return false;
          }

          seenUrls.add(normalizedUrl);
          return true;
        });
    });

    console.log(
      `Found ${releases.length} possible CSA articles.`
    );

    releases
      .slice(0, 10)
      .forEach((release, index) => {
        console.log(
          `\n${index + 1}. ${release.title}`
        );

        console.log(
          `   ${release.source_url}`
        );
      });

    if (releases.length === 0) {
      throw new Error(
        "No official CSA article links were found."
      );
    }

    console.log(
      "\nOfficial CSA link extraction test completed successfully."
    );
  } catch (error) {
    console.error(
      "CSA link extraction failed."
    );

    console.error(error.message);

    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeCSALinks();
