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

  await new Promise((resolve) => {
  setTimeout(resolve, 3000);
});

  console.log("Page loaded.\n");
  await new Promise((resolve) => {
  setTimeout(resolve, 8000);
 });
  const html = await page.content();
require("fs").writeFileSync("asc-page.html", html);

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

      const listingPath =
        "/en/news-and-publications/news-releases";

      const isArticle =
        pathname.startsWith(`${listingPath}/`) &&
        pathname !== listingPath;

      if (!isArticle || seen.has(pathname)) {
        return false;
      }

      seen.add(pathname);
      return true;
    });
});

console.log(
  `Found ${releases.length} possible ASC news releases.\n`
);

releases.slice(0, 20).forEach((item, index) => {
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
