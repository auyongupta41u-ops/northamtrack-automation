#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK FINAL SCRAPER - ENHANCED
 * 
 * Generates 150+ word AI-powered summaries from RSS descriptions
 * SEC and OSC with UPSERT logic
 * ════════════════════════════════════════════════════════════════════════════════
 */

const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');
const { generateEnhancedSummary } = require('./summarizer-enhanced');

const parser = new Parser();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('════════════════════════════════════════════════════════════════');
console.log('  NORTHAMTRACK FINAL SCRAPER - ENHANCED');
console.log('  150+ Word AI-Powered Summaries');
console.log('  SEC and OSC with UPSERT (Update or Insert)');
console.log('════════════════════════════════════════════════════════════════\n');

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
            
            // Generate 150+ word summary using AI
            console.log(`  📝 Generating summary for: ${item.title.substring(0, 50)}...`);
            const enhanced = await generateEnhancedSummary({
                title: item.title,
                description: item.content || item.summary || item.description || '',
                regulator: 'SEC',
                category: 'news'
            });
            
            items.push({
                title: item.title,
                summary: enhanced.summary,
                full_text: enhanced.summary, // Store summary in full_text column
                source_url: item.link,
                published_date: new Date(item.pubDate),
                regulator: 'SEC',
                regulator_name: 'U.S. Securities and Exchange Commission',
                regulator_country: 'USA',
                category: 'news',
                impact_rating: 'LOW',
                mutual_fund_relevance: 0.45,
                why_it_matters: enhanced.why_it_matters,
                actions_needed: enhanced.actions_needed,
                tags: ['SEC', 'Press Release'],
                summarization_version: enhanced.summarization_version
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
            
            // Generate 150+ word summary using AI
            console.log(`  📝 Generating summary for: ${item.title.substring(0, 50)}...`);
            const enhanced = await generateEnhancedSummary({
                title: item.title,
                description: item.content || item.summary || item.description || '',
                regulator: 'OSC',
                category: 'news'
            });
            
            items.push({
                title: item.title,
                summary: enhanced.summary,
                full_text: enhanced.summary, // Store summary in full_text column
                source_url: item.link,
                published_date: new Date(item.pubDate),
                regulator: 'OSC',
                regulator_name: 'Ontario Securities Commission',
                regulator_country: 'Canada',
                category: 'news',
                impact_rating: 'LOW',
                mutual_fund_relevance: 0.45,
                why_it_matters: enhanced.why_it_matters,
                actions_needed: enhanced.actions_needed,
                tags: ['OSC', 'News'],
                summarization_version: enhanced.summarization_version
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
// UPSERT TO SUPABASE (Update or Insert)
// ════════════════════════════════════════════════════════════════════════════════

async function upsertToSupabase(items) {
    console.log(`\n📝 Processing ${items.length} items for UPSERT...\n`);
    
    let updated = 0;
    let inserted = 0;
    let failed = 0;
    
    for (const item of items) {
        try {
            // Check if already exists by source_url
            const { data: existing, error: selectError } = await supabase
                .from('regulatory_updates')
                .select('id')
                .eq('source_url', item.source_url)
                .single();
            
            if (existing) {
                // UPDATE existing record with summarization data
                const { error: updateError } = await supabase
                    .from('regulatory_updates')
                    .update({
                        summary: item.summary,
                        why_it_matters: item.why_it_matters,
                        actions_needed: item.actions_needed,
                        full_text: item.full_text,
                        summarization_version: item.summarization_version,
                        updated_at: new Date()
                    })
                    .eq('source_url', item.source_url);
                
                if (updateError) {
                    console.error(`❌ Update Error: ${updateError.message}`);
                    failed++;
                } else {
                    console.log(`✏️  Updated: ${item.title.substring(0, 50)}...`);
                    updated++;
                }
            } else {
                // INSERT new record
                const { error: insertError } = await supabase
                    .from('regulatory_updates')
                    .insert({
                        title: item.title,
                        summary: item.summary,
                        full_text: item.full_text,
                        source_url: item.source_url,
                        published_date: item.published_date,
                        regulator: item.regulator,
                        regulator_name: item.regulator_name,
                        regulator_country: item.regulator_country,
                        category: item.category,
                        impact_rating: item.impact_rating,
                        mutual_fund_relevance: item.mutual_fund_relevance,
                        why_it_matters: item.why_it_matters,
                        actions_needed: item.actions_needed,
                        tags: item.tags,
                        summarization_version: item.summarization_version,
                        is_active: true
                    });
                
                if (insertError) {
                    console.error(`❌ Insert Error: ${insertError.message}`);
                    failed++;
                } else {
                    console.log(`✅ Inserted: ${item.title.substring(0, 50)}...`);
                    inserted++;
                }
            }
        } catch (error) {
            console.error(`❌ Processing Error: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\n📊 Summary: ${updated} updated, ${inserted} inserted, ${failed} failed`);
    return { updated, inserted, failed };
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
        
        if (allItems.length === 0) {
            console.log('⚠️  No items collected. Exiting.');
            process.exit(0);
        }
        
        // UPSERT to Supabase
        const result = await upsertToSupabase(allItems);
        
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
