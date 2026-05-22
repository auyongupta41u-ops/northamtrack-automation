#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK REGULATORY AUTOMATION SCRAPER
 * Version 2.0 - Production Backend
 * 
 * Fetches regulatory updates from 8 Canadian & US regulators
 * Stores in Supabase with duplicate prevention
 * Logs errors for monitoring
 * ════════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const xml2js = require('xml2js');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RUN_ID = process.env.RUN_ID || 'manual-' + Date.now();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const xmlParser = new xml2js.Parser({ explicitArray: false });

// Regulator configuration
const REGULATORS = {
  SEC: {
    name: 'SEC',
    fullName: 'U.S. Securities and Exchange Commission',
    country: 'USA',
    feeds: [
      'https://www.sec.gov/newsroom/press-releases/feed',
      'https://www.sec.gov/cgi-bin/browse-rss?action=getfeed&feed=News&count=100'
    ]
  },
  OSC: {
    name: 'OSC',
    fullName: 'Ontario Securities Commission',
    country: 'Canada',
    feeds: [
      'https://www.osc.ca/en/news-and-events/news-releases/rss',
      'https://www.osc.ca/en/news-and-events/news/rss'
    ]
  },
  CSA: {
    name: 'CSA',
    fullName: 'Canadian Securities Administrators',
    country: 'Canada',
    feeds: [
      'https://www.securities-administrators.ca/news-and-publications/news/rss',
      'https://www.securities-administrators.ca/news-and-publications/publications/rss'
    ]
  },
  BCSC: {
    name: 'BCSC',
    fullName: 'British Columbia Securities Commission',
    country: 'Canada',
    feeds: [
      'https://www.bcsc.bc.ca/news-and-publications/news/rss',
      'https://www.bcsc.bc.ca/news-and-publications/publications/rss'
    ]
  },
  ASC: {
    name: 'ASC',
    fullName: 'Alberta Securities Commission',
    country: 'Canada',
    feeds: [
      'https://www.asc.ca/news-and-publications/news/rss',
      'https://www.asc.ca/news-and-publications/publications/rss'
    ]
  },
  AMF: {
    name: 'AMF',
    fullName: 'Autorité des marchés financiers (Québec)',
    country: 'Canada',
    feeds: [
      'https://www.amf-quebec.ca/en/news-and-publications/news/rss',
      'https://www.amf-quebec.ca/en/news-and-publications/publications/rss'
    ]
  },
  FCAA: {
    name: 'FCAA',
    fullName: 'Financial and Consumer Affairs Authority (Saskatchewan)',
    country: 'Canada',
    feeds: [
      'https://www.fcaa.gov.sk.ca/news-and-publications/news/rss',
      'https://www.fcaa.gov.sk.ca/news-and-publications/publications/rss'
    ]
  },
  CIRO: {
    name: 'CIRO',
    fullName: 'Canadian Investment Regulatory Organization',
    country: 'Canada',
    feeds: [
      'https://www.ciro.ca/news-and-publications/news/rss',
      'https://www.ciro.ca/news-and-publications/publications/rss'
    ]
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// STATISTICS
// ════════════════════════════════════════════════════════════════════════════════

const stats = {
  totalFetched: 0,
  totalProcessed: 0,
  totalDuplicates: 0,
  totalErrors: 0,
  regulatorsProcessed: [],
  startTime: Date.now()
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 Starting regulatory automation scraper...');
  console.log(`📅 Run ID: ${RUN_ID}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  
  try {
    // Create scraper run record
    const { data: runData, error: runError } = await supabase
      .from('scraper_runs')
      .insert({
        run_type: 'scheduled',
        triggered_by: 'github_actions',
        status: 'running',
        regulators_processed: []
      })
      .select()
      .single();

    if (runError) throw runError;
    const runId = runData.id;

    // Fetch from all regulators
    for (const [code, config] of Object.entries(REGULATORS)) {
      console.log(`\n📡 Processing ${code}...`);
      try {
        await processRegulator(code, config);
        stats.regulatorsProcessed.push(code);
      } catch (error) {
        console.error(`❌ Error processing ${code}:`, error.message);
        stats.totalErrors++;
        await logError('regulator_error', error.message, error.stack, code);
      }
    }

    // Update scraper run record
    const duration = Math.floor((Date.now() - stats.startTime) / 1000);
    const { error: updateError } = await supabase
      .from('scraper_runs')
      .update({
        status: 'completed',
        total_fetched: stats.totalFetched,
        total_processed: stats.totalProcessed,
        total_duplicates: stats.totalDuplicates,
        total_errors: stats.totalErrors,
        regulators_processed: stats.regulatorsProcessed,
        completed_at: new Date().toISOString(),
        duration_seconds: duration
      })
      .eq('id', runId);

    if (updateError) throw updateError;

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ SCRAPER COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`📊 Statistics:`);
    console.log(`   Total Fetched: ${stats.totalFetched}`);
    console.log(`   Total Processed: ${stats.totalProcessed}`);
    console.log(`   Total Duplicates: ${stats.totalDuplicates}`);
    console.log(`   Total Errors: ${stats.totalErrors}`);
    console.log(`   Regulators: ${stats.regulatorsProcessed.join(', ')}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await logError('fatal_error', error.message, error.stack);
    process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PROCESS REGULATOR
// ════════════════════════════════════════════════════════════════════════════════

async function processRegulator(code, config) {
  for (const feedUrl of config.feeds) {
    try {
      console.log(`  📥 Fetching: ${feedUrl.substring(0, 60)}...`);
      
      const response = await axios.get(feedUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'NorthamTrack-Automation/2.0'
        }
      });

      const items = await parseRSSFeed(response.data, code, config);
      console.log(`  ✓ Got ${items.length} items`);
      stats.totalFetched += items.length;

      // Process each item
      for (const item of items) {
        await processItem(item, code, config);
      }
    } catch (error) {
      console.error(`  ❌ Error fetching ${code} feed:`, error.message);
      stats.totalErrors++;
      await logError('fetch_error', error.message, error.stack, code, feedUrl);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PARSE RSS FEED
// ════════════════════════════════════════════════════════════════════════════════

async function parseRSSFeed(xmlText, code, config) {
  try {
    const result = await xmlParser.parseStringPromise(xmlText);
    const items = result.rss?.channel?.item || [];
    
    // Ensure items is an array
    return Array.isArray(items) ? items : [items];
  } catch (error) {
    console.error(`  ❌ XML parse error for ${code}:`, error.message);
    await logError('parse_error', error.message, error.stack, code);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PROCESS ITEM
// ════════════════════════════════════════════════════════════════════════════════

async function processItem(item, code, config) {
  try {
    // Extract data from RSS item
    const title = item.title || '';
    const description = item.description || '';
    const link = item.link || '';
    const pubDate = item.pubDate || new Date().toISOString();
    
    if (!title || !link) return; // Skip invalid items

    // Check for duplicates using source_url
    const { data: existingHash } = await supabase
      .from('processed_hashes')
      .select('id')
      .eq('source_url', link)
      .single();

    if (existingHash) {
      stats.totalDuplicates++;
      return; // Already processed
    }

    // Generate hashes
    const titleHash = hashString(title);
    const dateHash = hashString(pubDate);
    const combinedHash = hashString(title + pubDate);

    // Categorize and score
    const category = categorizeUpdate(title, description);
    const impactRating = rateImpact(title, description);
    const relevance = calculateRelevance(title, description);
    const tags = extractTags(title, description);

    // Generate summary
    const summary = generateSummary(title, description);

    // Insert into database
    const { data: updateData, error: insertError } = await supabase
      .from('regulatory_updates')
      .insert({
        title: cleanText(title),
        summary: cleanText(summary),
        full_text: cleanText(description),
        source_url: link,
        regulator: code,
        regulator_name: config.name,
        regulator_country: config.country,
        category: category,
        impact_rating: impactRating,
        mutual_fund_relevance: relevance,
        tags: tags,
        published_date: new Date(pubDate).toISOString(),
        is_processed: true,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      // Check if it's a duplicate key error
      if (insertError.code === '23505') {
        stats.totalDuplicates++;
      } else {
        throw insertError;
      }
    } else {
      // Record the hash
      await supabase
        .from('processed_hashes')
        .insert({
          source_url: link,
          title_hash: titleHash,
          date_hash: dateHash,
          combined_hash: combinedHash,
          regulator: code,
          duplicate_of_id: updateData.id
        })
        .select()
        .single();

      stats.totalProcessed++;
    }
  } catch (error) {
    console.error('  ❌ Error processing item:', error.message);
    stats.totalErrors++;
    await logError('process_error', error.message, error.stack, code);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function generateSummary(title, description) {
  let text = cleanText(description);
  let sentences = text.split(/[.!?]+/).slice(0, 2);
  let summary = sentences.join('. ').trim();
  
  if (summary.length > 200) {
    summary = summary.substring(0, 197) + '...';
  }
  
  if (!summary || summary.length < 20) {
    summary = title.substring(0, 150);
  }
  
  return summary;
}

function categorizeUpdate(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  
  if (text.includes('enforcement') || text.includes('charges') || 
      text.includes('sanction') || text.includes('cease-and-desist') ||
      text.includes('penalty') || text.includes('violation')) {
    return 'enforcement_order';
  } else if (text.includes('settlement') || text.includes('agrees') || 
             text.includes('resolves') || text.includes('admits')) {
    return 'settlement';
  } else if (text.includes('alert') || text.includes('warning') || 
             text.includes('fraud') || text.includes('scam') || text.includes('beware')) {
    return 'investor_alert';
  } else if (text.includes('decision') || text.includes('ruling') || 
             text.includes('order') || text.includes('judgment')) {
    return 'decision';
  } else if (text.includes('guidance') || text.includes('proposes') || 
             text.includes('rule') || text.includes('amendment') || 
             text.includes('requirement') || text.includes('notice')) {
    return 'regulatory_notice';
  } else {
    return 'news';
  }
}

function rateImpact(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  
  if (text.includes('landmark') || text.includes('historic') || text.includes('major') || 
      text.includes('first-ever') || text.includes('billion') || text.includes('cease-and-desist') ||
      text.includes('permanent ban') || text.includes('unprecedented')) {
    return 'HIGH';
  }
  
  if (text.includes('guidance') || text.includes('proposes') || text.includes('amendment') ||
      text.includes('settlement') || text.includes('million') || text.includes('enforcement') ||
      text.includes('consultation') || text.includes('policy')) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

function calculateRelevance(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  let score = 0;

  if (text.includes('mutual fund') || text.includes('etf') || text.includes('investment company') ||
      text.includes('fund') && text.includes('manager')) {
    score = Math.max(score, 1.0);
  } else if (text.includes('investment adviser') || text.includes('fund manager') || 
      text.includes('asset manager') || text.includes('portfolio manager')) {
    score = Math.max(score, 0.9);
  } else if (text.includes('broker-dealer') || text.includes('registered representative') || 
      text.includes('financial adviser') || text.includes('dealer')) {
    score = Math.max(score, 0.8);
  } else if (text.includes('fee') || text.includes('performance') || text.includes('disclosure') || 
      text.includes('suitability') || text.includes('expense ratio')) {
    score = Math.max(score, 0.7);
  } else if (text.includes('investor') || text.includes('securities') || text.includes('compliance') ||
      text.includes('regulation')) {
    score = Math.max(score, 0.5);
  } else if (text.includes('cryptocurrency') || text.includes('crypto') || text.includes('bitcoin')) {
    score = Math.max(score, 0.4);
  }

  return Math.min(score, 1.0);
}

function extractTags(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  const tags = [];
  
  const tagKeywords = {
    'AI': ['artificial intelligence', 'ai', 'machine learning', 'algorithm'],
    'Cybersecurity': ['cybersecurity', 'data breach', 'hacking', 'security', 'cyber'],
    'Cryptocurrency': ['cryptocurrency', 'crypto', 'blockchain', 'bitcoin', 'token'],
    'Fraud': ['fraud', 'scam', 'deception', 'misrepresentation', 'scheme'],
    'Enforcement': ['enforcement', 'charges', 'sanction', 'penalty', 'fine'],
    'Fee Disclosure': ['fee', 'expense', 'charges', 'compensation', 'cost'],
    'Suitability': ['suitability', 'unsuitable', 'recommendation', 'advice'],
    'Compliance': ['compliance', 'guidance', 'requirement', 'rule', 'regulation'],
    'ESG': ['esg', 'environmental', 'social', 'governance', 'sustainable'],
    'Insider Trading': ['insider trading', 'material nonpublic', 'mnpi', 'insider']
  };

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }

  return tags.slice(0, 5);
}

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ════════════════════════════════════════════════════════════════════════════════
// ERROR LOGGING
// ════════════════════════════════════════════════════════════════════════════════

async function logError(errorType, errorMessage, errorStack = null, regulator = null, sourceUrl = null, feedUrl = null) {
  try {
    await supabase
      .from('error_logs')
      .insert({
        error_type: errorType,
        error_message: errorMessage,
        error_stack: errorStack,
        regulator: regulator,
        source_url: sourceUrl,
        feed_url: feedUrl,
        severity: 'error'
      });
  } catch (error) {
    console.error('Failed to log error:', error);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════════════

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
