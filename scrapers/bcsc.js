const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.bcsc.bc.ca";
const NEWS_URL =
  "https://www.bcsc.bc.ca/about/media-room/news-releases";

async function scrapeBCSCLinks() {
  try {
    console.log("Downloading the BCSC news releases page...");

    const response = await axios.get(NEWS_URL, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NorthAmTrack Regulatory Monitor/1.0)"
      }
    });

    const $ = cheerio.load(response.data);
    const releases = [];
    const seenUrls = new Set();

    $("a[href]").each((index, element) => {
      const href = $(element).attr("href");
      const title = $(element).text().replace(/\s+/g, " ").trim();

      if (!href || !title) {
        return;
      }

      const absoluteUrl = new URL(href, BASE_URL).href;

      const isNewsRelease =
        absoluteUrl.includes("/about/media-room/news-releases/") &&
        absoluteUrl !== `${NEWS_URL}/` &&
        absoluteUrl !== NEWS_URL;

      if (!isNewsRelease || seenUrls.has(absoluteUrl)) {
        return;
      }

      seenUrls.add(absoluteUrl);

      releases.push({
        title,
        source_url: absoluteUrl
      });
    });

    console.log(`Found ${releases.length} possible BCSC news releases.`);

    releases.slice(0, 10).forEach((release, index) => {
      console.log(`\n${index + 1}. ${release.title}`);
      console.log(`   ${release.source_url}`);
    });

    if (releases.length === 0) {
      console.error("No BCSC news-release links were found.");
      process.exit(1);
    }

    console.log("\nBCSC link extraction test completed.");
  } catch (error) {
    console.error("BCSC link extraction failed.");

    if (error.response) {
      console.error(`HTTP status: ${error.response.status}`);
    } else {
      console.error(error.message);
    }

    process.exit(1);
  }
}

scrapeBCSCLinks();
