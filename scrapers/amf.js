const puppeteer = require("puppeteer");

const NEWS_URL =
  "https://lautorite.qc.ca/en/general-public/media-centre/news";

async function run() {

  console.log("================================");
  console.log("AMF SCRAPER");
  console.log("================================\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1366,
    height: 768
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
  );

  console.log("Opening AMF news page...");

  await page.goto(NEWS_URL, {
    waitUntil: "networkidle2",
    timeout: 90000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log("Page loaded.\n");
  const releases = await page.evaluate(() => {
  const seen = new Set();

  const cleanText = (value = "") =>
    String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return Array.from(
    document.querySelectorAll("a[href]")
  )
    .map((link) => {
      const container =
        link.closest("article") ||
        link.closest("li") ||
        link.closest("div");

      const dateElement =
        container?.querySelector("time") ||
        container?.querySelector(
          '[class*="date"]'
        );

      return {
        title: cleanText(
          link.textContent
        ),

        source_url: link.href,

        listing_date:
          dateElement?.getAttribute(
            "datetime"
          ) ||
          cleanText(
            dateElement?.textContent
          )
      };
    })
    .filter((item) => {
      if (
        !item.title ||
        item.title.length < 15
      ) {
        return false;
      }

      let pathname;

      try {
        pathname = new URL(
          item.source_url
        ).pathname.toLowerCase();
      } catch {
        return false;
      }

      const isAMFArticle =
        pathname.includes(
          "/media-centre/news/fiche-dactualites/"
        );

      if (
        !isAMFArticle ||
        seen.has(pathname)
      ) {
        return false;
      }

      seen.add(pathname);

      return true;
    });
});

console.log(
  `Found ${releases.length} possible AMF articles.\n`
);

releases
  .slice(0, 15)
  .forEach((release, index) => {
    console.log(
      `${index + 1}. ${release.title}`
    );

    console.log(
      `Date: ${
        release.listing_date ||
        "Not found"
      }`
    );

    console.log(
      release.source_url
    );

    console.log(
      "--------------------------------"
    );
  });

if (releases.length === 0) {
  throw new Error(
    "No AMF article links were found."
  );
}
  console.log("\n================================");
console.log("AMF Diagnostic Completed");
console.log("================================");

await browser.close();

}

run().catch((error) => {
  console.error("AMF scraper failed.");
  console.error(error.stack || error.message);
  process.exit(1);
});
