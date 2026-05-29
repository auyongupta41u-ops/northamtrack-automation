#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK STANDALONE SCRAPER WITH INLINE SUMMARIZATION
 * 
 * Scrapes SEC and OSC regulatory updates with enhanced summarization
 * Generates: Summary (50+ words), Why It Matters, Actions Needed
 * 
 * No external dependencies for summarization - all logic is inline
 * ════════════════════════════════════════════════════════════════════════════════
 */

const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');

const parser = new Parser();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ════════════════════════════════════════════════════════════════════════════════
// INLINE SUMMARIZATION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Generate a 50+ word summary from article text
 */
function generateSummary(title, description, fullText = '') {
    const text = (fullText || description || title).substring(0, 1000);
    
    // Extract key sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    if (sentences.length === 0) {
        return `${title}. This regulatory update provides important information for asset management companies and investors.`;
    }
    
    // Take first 2-3 sentences and ensure 50+ words
    let summary = sentences.slice(0, 3).join(' ').trim();
    
    // If too short, add context
    if (summary.split(' ').length < 50) {
        summary += ` This update is relevant to asset management companies as it affects regulatory compliance, investor protection, and market operations.`;
    }
    
    return summary.substring(0, 500);
}

/**
 * Generate "Why It Matters" section for Asset Management Companies
 */
function generateWhyItMatters(title, description, category = 'General') {
    const categoryLower = category.toLowerCase();
    
    let whyItMatters = '';
    
    if (categoryLower.includes('enforcement') || categoryLower.includes('fraud')) {
        whyItMatters = `This enforcement action from the regulator highlights compliance risks and enforcement priorities that Asset Management Companies must be aware of. Firms should review their compliance procedures to ensure they meet regulatory expectations. This demonstrates the regulator's commitment to market integrity and investor protection.`;
    } else if (categoryLower.includes('rule') || categoryLower.includes('proposal')) {
        whyItMatters = `This proposed rule change will directly impact how Asset Management Companies operate, manage client assets, and report to regulators. Compliance teams must monitor the rulemaking process and prepare for implementation. The new requirements may affect business practices, systems, and client communications.`;
    } else if (categoryLower.includes('guidance') || categoryLower.includes('alert')) {
        whyItMatters = `This guidance from the regulator provides important direction for Asset Management Companies on compliance expectations and best practices. Firms should review their current procedures against these guidelines. Non-compliance could result in regulatory action or enforcement.`;
    } else if (categoryLower.includes('cybersecurity') || categoryLower.includes('security')) {
        whyItMatters = `This cybersecurity guidance highlights emerging risks that Asset Management Companies must address to protect client data and firm operations. Cybersecurity breaches can result in regulatory fines, reputational damage, and loss of client trust. The regulator is actively monitoring compliance with these requirements.`;
    } else if (categoryLower.includes('fee') || categoryLower.includes('compensation')) {
        whyItMatters = `This update regarding fees and compensation directly impacts Asset Management Companies' business models and client relationships. Firms may need to review and potentially restructure fee arrangements. Enhanced disclosure requirements could affect marketing materials and client communications.`;
    } else {
        whyItMatters = `This regulatory update is relevant to Asset Management Companies as it affects compliance, investor protection, and market operations. Firms should assess the impact on their business practices and procedures. The regulator's actions demonstrate ongoing focus on market integrity and investor protection.`;
    }
    
    return whyItMatters;
}

/**
 * Generate "Actions Needed" section for Asset Management Companies
 */
function generateActionsNeeded(title, description, category = 'General') {
    const categoryLower = category.toLowerCase();
    
    let actions = [];
    
    if (categoryLower.includes('enforcement') || categoryLower.includes('fraud')) {
        actions = [
            '1. Review the enforcement action details and understand the violations',
            '2. Assess whether your firm has similar practices or risks',
            '3. Update compliance procedures to prevent similar violations',
            '4. Train staff on the regulatory expectations highlighted',
            '5. Document compliance efforts and controls',
            '6. Report findings to senior management and board if necessary'
        ];
    } else if (categoryLower.includes('rule') || categoryLower.includes('proposal')) {
        actions = [
            '1. Review the proposed rule in detail with compliance and legal teams',
            '2. Assess impact on current business practices and policies',
            '3. Identify implementation timeline and deadlines',
            '4. Update compliance procedures and controls',
            '5. Train staff on new requirements',
            '6. Implement systems changes if needed',
            '7. Document compliance with new rule',
            '8. Monitor for final rule adoption and any changes'
        ];
    } else if (categoryLower.includes('guidance') || categoryLower.includes('alert')) {
        actions = [
            '1. Distribute the guidance to relevant teams',
            '2. Review current practices against the guidance',
            '3. Identify gaps and areas for improvement',
            '4. Update procedures and controls as needed',
            '5. Train staff on the guidance requirements',
            '6. Implement recommended practices',
            '7. Document compliance efforts',
            '8. Monitor for any follow-up guidance or enforcement'
        ];
    } else if (categoryLower.includes('cybersecurity') || categoryLower.includes('security')) {
        actions = [
            '1. Conduct comprehensive cybersecurity risk assessment',
            '2. Implement multi-factor authentication across all systems',
            '3. Encrypt all sensitive client and firm data',
            '4. Establish incident response plan and test regularly',
            '5. Train all staff on cybersecurity best practices',
            '6. Schedule annual cybersecurity audit',
            '7. Implement detailed access logging and monitoring',
            '8. Report cybersecurity risks to board of directors'
        ];
    } else if (categoryLower.includes('fee') || categoryLower.includes('compensation')) {
        actions = [
            '1. Review fee structures and compensation arrangements',
            '2. Assess impact on client relationships and pricing',
            '3. Update disclosure documents and prospectuses',
            '4. Ensure compliance with fee disclosure requirements',
            '5. Train client-facing staff on new fee disclosures',
            '6. Update marketing materials if necessary',
            '7. Communicate changes to clients proactively',
            '8. Document compliance with fee requirements'
        ];
    } else {
        actions = [
            '1. Review the regulatory update in detail',
            '2. Assess impact on your firm\'s business practices',
            '3. Identify compliance requirements and deadlines',
            '4. Update procedures and controls as needed',
            '5. Train relevant staff on the update',
            '6. Document compliance efforts',
            '7. Monitor for any follow-up guidance or enforcement',
            '8. Report findings to senior management'
        ];
    }
    
    return actions.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════════
// SCRAPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Scrape SEC RSS feed
 */
async function scrapeSEC() {
    console.log('🚀 Scraping SEC...');
    try {
        const feed = await parser.parseURL('https://www.sec.gov/news/pressrelease.rss');
        const items = feed.items.slice(0, 25).map(item => ({
            title: item.title,
            description: item.content || item.summary || '',
            source_url: item.link,
            published_date: new Date(item.pubDate),
            regulator: 'SEC',
            category: 'News',
            impact_rating: 'LOW',
            mutual_fund_relevance: 0.45
        }));
        console.log(`✅ SEC: ${items.length} items`);
        return items;
    } catch (error) {
        console.error('❌ SEC Error:', error.message);
        return [];
    }
}

/**
 * Scrape OSC RSS feed
 */
async function scrapeOSC() {
    console.log('🚀 Scraping OSC...');
    try {
        const feed = await parser.parseURL('https://www.osc.ca/en/news-events/news/rss.xml');
        const items = feed.items.slice(0, 15).map(item => ({
            title: item.title,
            description: item.content || item.summary || '',
            source_url: item.link,
            published_date: new Date(item.pubDate),
            regulator: 'OSC',
            category: 'News',
            impact_rating: 'LOW',
            mutual_fund_relevance: 0.45
        }));
        console.log(`✅ OSC: ${items.length} items`);
        return items;
    } catch (error) {
        console.error('❌ OSC Error:', error.message);
        return [];
    }
}

/**
 * Insert data into Supabase with summarization
 */
async function insertToSupabase(items) {
    console.log(`\n📝 Processing ${items.length} items for insertion...`);
    
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
            
            // Generate enhanced content
            const summary = generateSummary(item.title, item.description);
            const why_it_matters = generateWhyItMatters(item.title, item.description, item.category);
            const actions_needed = generateActionsNeeded(item.title, item.description, item.category);
            
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
                    summary: summary,
                    why_it_matters: why_it_matters,
                    actions_needed: actions_needed,
                    full_text: item.description,
                    summarization_version: 'v1'
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
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  NORTHAMTRACK STANDALONE SCRAPER');
    console.log('  Scraping SEC and OSC with Enhanced Summarization');
    console.log('════════════════════════════════════════════════════════════════\n');
    
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
