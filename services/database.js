// Shared database functions will go here.
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is missing.");
}

if (!supabaseKey) {
  throw new Error(
    "SUPABASE_SERVICE_KEY environment variable is missing."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Inserts new regulatory updates and updates existing records.
 * The source URL is used as the unique identifier.
 */
async function upsertRegulatoryUpdates(items) {
  console.log(
    `\nProcessing ${items.length} items for Supabase UPSERT...\n`
  );

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const { data: existing, error: selectError } = await supabase
        .from("regulatory_updates")
        .select("id")
        .eq("source_url", item.source_url)
        .maybeSingle();

      if (selectError) {
        throw selectError;
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from("regulatory_updates")
          .update({
            title: item.title,
            summary: item.summary,
            full_text: item.full_text,
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
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

        if (updateError) {
          throw updateError;
        }

        console.log(`Updated: ${item.title}`);
        updated++;
      } else {
        const { error: insertError } = await supabase
          .from("regulatory_updates")
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
          throw insertError;
        }

        console.log(`Inserted: ${item.title}`);
        inserted++;
      }
    } catch (error) {
      console.error(
        `Failed to save "${item.title}": ${error.message}`
      );
      failed++;
    }
  }

  console.log("\nSupabase result:");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  return {
    inserted,
    updated,
    failed
  };
}

module.exports = {
  upsertRegulatoryUpdates
};
