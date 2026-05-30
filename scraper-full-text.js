/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK FULL TEXT SCRAPER
 * 
 * Fetches and extracts complete article text from SEC and OSC websites
 * Uses Puppeteer for JavaScript-heavy pages, Cheerio for simple HTML
 * ════════════════════════════════════════════════════════════════════════════════
 */

const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const parser = new Parser();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('════════════════════════════════════════════════════════════════');
console.log('  NORTHAMTRACK FULL TEXT SCRAPER');
console.log('  SEC and OSC with Complete Article Text Extraction');
console.log('════════════════════════════════════════════════════════════════\n');

// ════════════════════════════════════════════════════════════════════════════════
// EXTRACT FULL TEXT FROM WEBPAGE
// ════════════════════════════════════════════════════════════════════════════════

async function extractFullText(url, source = 'SEC') {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    let fullText = '';
    
    if (source === 'SEC') {
      // SEC press releases have content in specific divs
      const mainContent = $('div.news-release-content, div.content, article, main').first();
      if (mainContent.length) {
        fullText = mainContent.text().trim();
      } else {
        // Fallback: get all paragraph text
        fullText = $('p').map((i, el) => $(el).text()).get().join('\n').trim();
      }
    } else if (source === 'OSC') {
      // OSC news items have content in specific areas
      const mainContent = $('div.news-item-content, div.content, article, main').first();
      if (mainContent.length) {
        fullText = mainContent.text().trim();
      } else {
        fullText = $('p').map((i, el) => $(el).text()).get().join('\n').trim();
      }
    }
    
    // Clean up text
    fullText = fullText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Clean up multiple newlines
      .trim();
    
    return fullText || null;
  } catch (error) {
    console.error(`❌ Error extracting text from ${url}:`, error.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SCRAPE SEC
// ════════════════════════════════════════════════════════════════════════════════

async function scrapeSEC() {
  console.log('🚀 Scraping SEC...');
  try {
    const feed = await parser.parseURL('https://www.sec.gov/news/pressreleases.rss');
    const items = [];
    
    for (let i = 0; i < Math.min(feed.items.length, 25); i++) {
      const item = feed.items[i];
      
      // Get RSS summary
      const rssSummary = item.content || item.summary || item.description || '';
      
      // Try to fetch full text from the article URL
      let fullText = rssSummary;
      if (item.link) {
        console.log(`  📄 Fetching full text from: ${item.link}`);
        const extracted = await extractFullText(item.link, 'SEC');
        if (extracted && extracted.length > rssSummary.length) {
          fullText = extracted;
        }
      }
      
      // Generic why it matters for SEC
      const why_it_matters = 'This SEC regulatory update is important for Asset Management Companies as it affects compliance, investor protection, and market operations. Firms should review their procedures to ensure alignment with SEC expectations and regulatory requirements.';
      
      // Generic actions needed for SEC
      const actions_needed = '1. Review the regulatory update in detail\n2. Assess impact on your firm\'s business practices\n3. Identify compliance requirements and deadlines\n4. Update procedures and controls as needed\n5. Train relevant staff on the update\n6. Document compliance efforts\n7. Monitor for any follow-up guidance or enforcement';
      
      items.push({
        title: item.title || '',
        summary: fullText,
        full_text: fullText,
        source_url: item.link || '',
        published_date: item.pubDate || new Date().toISOString(),
        regulator: 'SEC',
        regulator_name: 'U.S. Securities and Exchange Commission',
        regulator_country: 'USA',
        category: 'news',
        impact_rating: 'LOW',
        mutual_fund_relevance: 0.45,
        why_it_matters: why_it_matters,
        actions_needed: actions_needed,
        tags: ['SEC', 'Press Release'],
        summarization_version: '2.0'
      });
    }
    
    console.log(`✅ SEC: ${items.length} items collected\n`);
    return items;
  } catch (error) {
    console.error('❌ SEC Error:', error.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SCRAPE OSC
// ════════════════════════════════════════════════════════════════════════════════

async function scrapeOSC() {
  console.log('🚀 Scraping OSC...');
  try {
    const feed = await parser.parseURL('https://feeds.feedburner.com/rss_osc_headlines_en');
    const items = [];
    
    for (let i = 0; i < Math.min(feed.items.length, 15); i++) {
      const item = feed.items[i];
      
      // Get RSS summary
      const rssSummary = item.content || item.summary || item.description || '';
      
      // Try to fetch full text from the article URL
      let fullText = rssSummary;
      if (item.link) {
        console.log(`  📄 Fetching full text from: ${item.link}`);
        const extracted = await extractFullText(item.link, 'OSC');
        if (extracted && extracted.length > rssSummary.length) {
          fullText = extracted;
        }
      }
      
      // Generic why it matters for OSC
      const why_it_matters = 'This OSC regulatory update is important for Asset Management Companies operating in Ontario. It affects compliance requirements, investor protection standards, and market conduct expectations. Firms should assess how this applies to their operations and client relationships.';
      
      // Generic actions needed for OSC
      const actions_needed = '1. Review the OSC update in detail\n2. Assess impact on your Ontario operations\n3. Identify compliance requirements and deadlines\n4. Update procedures and controls as needed\n5. Train relevant staff on the update\n6. Document compliance efforts\n7. Monitor for any follow-up guidance or enforcement';
      
      items.push({
        title: item.title || '',
        summary: fullText,
        full_text: fullText,
        source_url: item.link || '',
        published_date: item.pubDate || new Date().toISOString(),
        regulator: 'OSC',
        regulator_name: 'Ontario Securities Commission',
        regulator_country: 'Canada',
        category: 'news',
        impact_rating: 'LOW',
        mutual_fund_relevance: 0.45,
        why_it_matters: why_it_matters,
        actions_needed: actions_needed,
        tags: ['OSC', 'News'],
        summarization_version: '2.0'
      });
    }
    
    console.log(`✅ OSC: ${items.length} items collected\n`);
    return items;
  } catch (error) {
    console.error('❌ OSC Error:', error.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// UPSERT TO SUPABASE
// ════════════════════════════════════════════════════════════════════════════════

async function upsertToSupabase(items) {
  if (items.length === 0) {
    console.log('⚠️  No items to upsert');
    return { inserted: 0, updated: 0, failed: 0 };
  }
  
  console.log(`📋 Processing ${items.length} items for UPSERT...`);
  
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  
  for (const item of items) {
    try {
      // Check if item already exists by source_url
      const { data: existing } = await supabase
        .from('regulatory_updates')
        .select('id')
        .eq('source_url', item.source_url)
        .single();
      
      if (existing) {
        // UPDATE existing record
        const { error } = await supabase
          .from('regulatory_updates')
          .update({
            summary: item.summary,
            full_text: item.full_text,
            why_it_matters: item.why_it_matters,
            actions_needed: item.actions_needed,
            summarization_version: item.summarization_version,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (error) {
          console.error(`❌ Update failed for ${item.title}:`, error.message);
          failed++;
        } else {
          console.log(`✏️  Updated: ${item.title.substring(0, 50)}...`);
          updated++;
        }
      } else {
        // INSERT new record
        const { error } = await supabase
          .from('regulatory_updates')
          .insert([item]);
        
        if (error) {
          console.error(`❌ Insert failed for ${item.title}:`, error.message);
          failed++;
        } else {
          console.log(`✨ Inserted: ${item.title.substring(0, 50)}...`);
          inserted++;
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${item.title}:`, error.message);
      failed++;
    }
  }
  
  return { inserted, updated, failed };
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    // Scrape both sources
    const secItems = await scrapeSEC();
    const oscItems = await scrapeOSC();
    
    const allItems = [...secItems, ...oscItems];
    const totalCollected = allItems.length;
    
    console.log(`\n📊 Total items collected: ${totalCollected}`);
    
    if (totalCollected === 0) {
      console.log('⚠️  No items collected. Exiting.');
      process.exit(0);
    }
    
    // Upsert to Supabase
    const result = await upsertToSupabase(allItems);
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`📊 Summary: ${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed`);
    console.log('════════════════════════════════════════════════════════════════\n');
    
    if (result.inserted > 0 || result.updated > 0) {
      console.log('✅ Scraper completed successfully!');
    } else if (result.failed > 0) {
      console.log('⚠️  Scraper completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
