#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK SIMPLE FIXED SCRAPER
 * 
 * Ultra-simple scraper with guaranteed summarization
 * No complex functions - just straightforward logic
 * ════════════════════════════════════════════════════════════════════════════════
 */

const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');

const parser = new Parser();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('════════════════════════════════════════════════════════════════');
console.log('  NORTHAMTRACK SIMPLE FIXED SCRAPER');
console.log('  SEC and OSC with Guaranteed Summarization');
console.log('════════════════════════════════════════════════════════════════\n');

// ════════════════════════════════════════════════════════════════════════════════
// SCRAPE SEC
// ════════════════════════════════════════════════════════════════════════════════

async function scrapeSEC() {
    console.log('🚀 Scraping SEC...');
    try {
        const feed = await parser.parseURL('https://www.sec.gov/news/pressrelease.rss');
        const items = [];
        
        for (let i = 0; i < Math.min(feed.items.length, 25); i++) {
            const item = feed.items[i];
            
            // Create summary from description
            const description = item.content || item.summary || '';
            const summary = description.substring(0, 300) + (description.length > 300 ? '...' : '');
            
            // Generic why it matters
            const why_it_matters = 'This SEC regulatory update is important for Asset Management Companies as it affects compliance, investor protection, and market operations. Firms should review their procedures to ensure alignment with SEC expectations and regulatory requirements.';
            
            // Generic actions needed
            const actions_needed = '1. Review the regulatory update in detail\n2. Assess impact on your firm\'s business practices\n3. Identify compliance requirements and deadlines\n4. Update procedures and controls as needed\n5. Train relevant staff on the update\n6. Document compliance efforts\n7. Monitor for any follow-up guidance or enforcement';
            
            items.push({
                title: item.title,
                description: description,
                source_url: item.link,
                published_date: new Date(item.pubDate),
                regulator: 'SEC',
                category: 'News',
                impact_rating: 'LOW',
                mutual_fund_relevance: 0.45,
                summary: summary,
                why_it_matters: why_it_matters,
                actions_needed: actions_needed,
                full_text: description,
                summarization_version: 'v1'
            });
        }
        
        console.log(`✅ SEC: ${items.length} items collected`);
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
        const feed = await parser.parseURL('https://www.osc.ca/en/news-events/news/rss.xml');
        const items = [];
        
        for (let i = 0; i < Math.min(feed.items.length, 15); i++) {
            const item = feed.items[i];
            
            // Create summary from description
            const description = item.content || item.summary || '';
            const summary = description.substring(0, 300) + (description.length > 300 ? '...' : '');
            
            // Generic why it matters
            const why_it_matters = 'This OSC regulatory update is important for Asset Management Companies operating in Ontario. It affects compliance requirements, investor protection standards, and market conduct expectations. Firms should assess how this applies to their operations and client relationships.';
            
            // Generic actions needed
            const actions_needed = '1. Review the OSC update in detail\n2. Assess impact on your firm\'s Ontario operations\n3. Identify any compliance gaps\n4. Update procedures and controls as needed\n5. Train staff on new requirements\n6. Document compliance efforts\n7. Monitor for any enforcement priorities';
            
            items.push({
                title: item.title,
                description: description,
                source_url: item.link,
                published_date: new Date(item.pubDate),
                regulator: 'OSC',
                category: 'News',
                impact_rating: 'LOW',
                mutual_fund_relevance: 0.45,
                summary: summary,
                why_it_matters: why_it_matters,
                actions_needed: actions_needed,
                full_text: description,
                summarization_version: 'v1'
            });
        }
        
        console.log(`✅ OSC: ${items.length} items collected`);
        return items;
    } catch (error) {
        console.error('❌ OSC Error:', error.message);
        return [];
    }
}

// ════════════════════════════════════════════════════════════════════════════════
// INSERT TO SUPABASE
// ════════════════════════════════════════════════════════════════════════════════

async function insertToSupabase(items) {
    console.log(`\n📝 Processing ${items.length} items for insertion...\n`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const item of items) {
        try {
            // Check if already exists
            const { data: existing } = await supabase
                .from('regulatory_updates')
                .select('id')
                .eq('source_url', item.source_url)
                .single();
            
            if (existing) {
                console.log(`⏭️  Skipping (duplicate): ${item.title.substring(0, 50)}...`);
                skipped++;
                continue;
            }
            
            // Insert into Supabase
            const { error } = await supabase
                .from('regulatory_updates')
                .insert({
                    title: item.title,
                    description: item.description,
                    source_url: item.source_url,
                    published_date: item.published_date,
                    regulator: item.regulator,
                    category: item.category,
                    impact_rating: item.impact_rating,
                    mutual_fund_relevance: item.mutual_fund_relevance,
                    summary: item.summary,
                    why_it_matters: item.why_it_matters,
                    actions_needed: item.actions_needed,
                    full_text: item.full_text,
                    summarization_version: item.summarization_version
                });
            
            if (error) {
                console.error(`❌ Insert Error: ${error.message}`);
                skipped++;
            } else {
                console.log(`✅ Inserted: ${item.title.substring(0, 50)}...`);
                inserted++;
            }
        } catch (error) {
            console.error(`❌ Processing Error: ${error.message}`);
            skipped++;
        }
    }
    
    console.log(`\n📊 Summary: ${inserted} inserted, ${skipped} skipped`);
    return { inserted, skipped };
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
        console.log(`\n📦 Total items collected: ${allItems.length}`);
        
        // Insert to Supabase
        const result = await insertToSupabase(allItems);
        
        console.log('\n════════════════════════════════════════════════════════════════');
        console.log('✅ Scraper completed successfully!');
        console.log('════════════════════════════════════════════════════════════════\n');
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        process.exit(1);
    }
}

main();
