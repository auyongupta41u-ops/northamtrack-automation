const puppeteer = require("puppeteer");

const HOME_URL = "https://www.asc.ca/";

async function run() {
  let browser;

  try {
    console.log("=================================");
    console.log("ASC DIAGNOSTIC SCRAPER");
    console.log("=================================\n");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
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
      "Chrome/138.0.0.0 Safari/537.36"
    );

    console.log("Opening the official ASC homepage...");

    await page.goto(HOME_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });

    console.log("Page loaded.\n");

    const releases = await page.evaluate(() => {
      const seen = new Set();

      return Array.from(
        document.querySelectorAll("a[href]")
      )
        .map((link) => ({
          title: link.textContent
            .replace(/\s+/g, " ")
            .trim(),

          url: link.href
        }))
        .filter((item) => {
          if (!item.title || item.title.length < 15) {
            return false;
          }

          let pathname;

          try {
            pathname = new URL(item.url)
              .pathname
              .toLowerCase()
              .replace(/\/$/, "");
          } catch {
            return false;
          }

          const articlePath =
            "/news-and-publications/news-releases/";

          const isNewsRelease =
            pathname.includes(articlePath);

          if (
            !isNewsRelease ||
            seen.has(pathname)
          ) {
            return false;
          }

          seen.add(pathname);
          return true;
        });
    });

    console.log(
      `Found ${releases.length} ASC news releases.\n`
    );

    releases.forEach((item, index) => {
      console.log(
        `${index + 1}. ${item.title}`
      );

      console.log(item.url);
      console.log("--------------------------------");
    });

    if (releases.length === 0) {
      throw new Error(
        "No ASC news-release links were found."
      );
    }

    console.log("\n=================================");
    console.log("ASC Diagnostic Completed");
    console.log("=================================");
  } catch (error) {
    console.error("ASC diagnostic failed.");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run();
