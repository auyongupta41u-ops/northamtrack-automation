const puppeteer = require("puppeteer");

const NEWS_URL =
  "https://www.asc.ca/en/news-and-publications/news-releases";

async function run() {
  console.log("=================================");
  console.log("ASC DIAGNOSTIC SCRAPER");
  console.log("=================================\n");

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

  console.log("Opening ASC News Releases page...");

  await page.goto(NEWS_URL, {
    waitUntil: "networkidle2",
    timeout: 90000
  });

  await page.waitForTimeout(3000);

  console.log("Page loaded.\n");
const releases = await page.evaluate(() => {

  const articles = [];

  const seen = new Set();

  document
    .querySelectorAll("a[href]")
    .forEach((link) => {

      const title =
        link.textContent
          .replace(/\s+/g, " ")
          .trim();

      const url = link.href;

      if (
        !title ||
        title.length < 15
      ) {
        return;
      }

      if (
        !url.includes("/news")
      ) {
        return;
      }

      if (seen.has(url)) {
        return;
      }

      seen.add(url);

      articles.push({
        title,
        url
      });

    });

  return articles;

});

console.log(
  `Found ${releases.length} possible news releases.\n`
);

releases.forEach((item, index) => {

  console.log(
    `${index + 1}. ${item.title}`
  );

  console.log(item.url);

  console.log("--------------------------------");

});

console.log("\n=================================");
console.log("ASC Diagnostic Completed");
console.log("=================================");

await browser.close();

}

run().catch((error) => {

  console.error(error);

  process.exit(1);

});
