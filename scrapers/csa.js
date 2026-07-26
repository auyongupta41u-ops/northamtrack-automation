const puppeteer = require("puppeteer");

const NEWS_URL =
  "https://www.securities-administrators.ca/news/";

async function scrapeCSALinks() {
  let browser;

  try {
    console.log("Opening the official CSA news page...");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1366,
      height: 768
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/131.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-CA,en-US;q=0.9,en;q=0.8"
    });

    await page.goto(NEWS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    console.log(`Loaded URL: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);

    await new Promise((resolve) =>
      setTimeout(resolve, 10000)
    );

    const pageInformation = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body
          ? document.body.innerText
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 1000)
          : "",
        links: Array.from(
          document.querySelectorAll("a[href]")
        ).map((link) => ({
          title: link.textContent
            .replace(/\s+/g, " ")
            .trim(),
          url: link.href
        }))
      };
    });

    console.log(
      `Page text preview: ${pageInformation.bodyText}`
    );

    console.log(
      `Total links found: ${pageInformation.links.length}`
    );

    const seenUrls = new Set();

    const releases = pageInformation.links.filter(
      (release) => {
        const normalizedUrl =
          release.url.replace(/\/$/, "");

        const listingUrl =
          "https://www.securities-administrators.ca/news";

        const isPossibleArticle =
          release.title.length >= 15 &&
          normalizedUrl.startsWith(
            `${listingUrl}/`
          ) &&
          normalizedUrl !== listingUrl;

        if (
          !isPossibleArticle ||
          seenUrls.has(normalizedUrl)
        ) {
          return false;
        }

        seenUrls.add(normalizedUrl);
        return true;
      }
    );

    console.log(
      `Found ${releases.length} possible CSA articles.`
    );

    releases
      .slice(0, 10)
      .forEach((release, index) => {
        console.log(
          `\n${index + 1}. ${release.title}`
        );
        console.log(`   ${release.url}`);
      });

    if (releases.length === 0) {
      console.log(
        "\nNo articles were detected."
      );

      console.log(
        "The page preview above will show whether the CSA website presented a security or JavaScript verification page."
      );

      throw new Error(
        "No official CSA article links were found."
      );
    }

    console.log(
      "\nOfficial CSA link extraction test completed successfully."
    );
  } catch (error) {
    console.error("CSA link extraction failed.");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeCSALinks();
