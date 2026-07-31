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

const diagnosticLinks = await page.evaluate(() => {
  return Array.from(
    document.querySelectorAll("a")
  )
    .slice(0, 100)
    .map((link) => ({
      text: link.textContent
        .replace(/\s+/g, " ")
        .trim(),

      href: link.href,

      className:
        typeof link.className === "string"
          ? link.className
          : ""
    }));
});

console.log(
  `Total links found: ${diagnosticLinks.length}`
);

diagnosticLinks.forEach((link, index) => {
  console.log(`\n${index + 1}. ${link.text}`);
  console.log(`URL: ${link.href}`);
  console.log(`Class: ${link.className}`);
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
