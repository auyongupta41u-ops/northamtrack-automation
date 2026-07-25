const puppeteer = require("puppeteer");

const NEWS_URL =
  "https://www.bcsc.bc.ca/about/media-room/news-releases";

async function scrapeBCSCLinks() {
  let browser;

  try {
    console.log("Opening the BCSC news releases page in a browser...");

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
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
        Array.from(document.querySelectorAll("a")).some((link) =>
          link.href.includes("/about/media-room/news-releases/")
        ),
      { timeout: 30000 }
    );

    const releases = await page.evaluate(() => {
      const seenUrls = new Set();

      return Array.from(document.querySelectorAll("a[href]"))
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
            container?.querySelector("[class*='date']");

          const summaryElement =
            container?.querySelector("p") ||
            container?.querySelector(".description") ||
            container?.querySelector("[class*='description']");

          return {
            title,
            source_url: link.href,
            published_date:
              dateElement?.getAttribute("datetime") ||
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
          const isRelease =
            release.title &&
            release.source_url.includes(
              "/about/media-room/news-releases/"
            );

          if (
            !isRelease ||
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

    releases.slice(0, 10).forEach((release, index) => {
      console.log(`\n${index + 1}. ${release.title}`);
      console.log(
        `   Date: ${release.published_date || "Not found"}`
      );
      console.log(
        `   Summary: ${release.summary_text || "Not found"}`
      );
      console.log(`   URL: ${release.source_url}`);
    });

    if (releases.length === 0) {
      throw new Error(
        "No BCSC news-release links were found."
      );
    }

    console.log(
      "\nBCSC date and summary extraction test completed."
    );
  } catch (error) {
    console.error("BCSC extraction failed.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeBCSCLinks();
