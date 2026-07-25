const axios = require("axios");

async function testBCSCConnection() {
  const url = "https://www.bcsc.bc.ca/about/media-room/news-releases";

  try {
    console.log("Connecting to the BCSC website...");

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NorthAmTrack Regulatory Monitor/1.0)"
      }
    });

    console.log(`BCSC connection successful.`);
    console.log(`HTTP status: ${response.status}`);
    console.log(`Downloaded characters: ${response.data.length}`);
  } catch (error) {
    console.error("BCSC connection failed.");

    if (error.response) {
      console.error(`HTTP status: ${error.response.status}`);
    } else {
      console.error(error.message);
    }

    process.exit(1);
  }
}

testBCSCConnection();
