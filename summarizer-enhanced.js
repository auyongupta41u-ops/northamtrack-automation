/**
 * ════════════════════════════════════════════════════════════════════════════════
 * ENHANCED ARTICLE SUMMARIZATION MODULE
 * Generates 150+ word AI-powered summaries for regulatory updates
 * 
 * Features:
 * - 150+ word summaries (expanded from RSS descriptions)
 * - Why it matters for Asset Management Companies
 * - Actions needed from AMC perspective
 * - Uses OpenAI API for intelligent expansion (with fallback)
 * ════════════════════════════════════════════════════════════════════════════════
 */

let openai = null;

// Try to initialize OpenAI client if API key is available
try {
  const OpenAI = require('openai').default || require('openai');
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (error) {
  console.warn('⚠️  OpenAI module not available or API key missing. Using manual summarization.');
  openai = null;
}

// ════════════════════════════════════════════════════════════════════════════════
// GENERATE 150+ WORD SUMMARY
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Generate 150+ word summary using OpenAI (with fallback to manual expansion)
 * @param {string} title - Article title
 * @param {string} description - RSS description (short text)
 * @param {string} regulator - Regulator name (SEC, OSC, BCSC, etc.)
 * @returns {Promise<string>} 150+ word summary
 */
async function generateSummary(title, description, regulator) {
  try {
    if (!description || description.trim().length === 0) {
      return `${regulator} has issued an important regulatory update regarding ${title.toLowerCase()}. This update is relevant to Asset Management Companies and other market participants. Please refer to the official source for complete details and implementation requirements. Firms should assess the potential impact on their business and compliance obligations. Staying informed about regulatory developments is essential for maintaining compliance and managing risk effectively. For more information, visit the official ${regulator} website or contact your compliance team.`;
    }

    // Try to use OpenAI API if available
    if (openai && process.env.OPENAI_API_KEY) {
      try {
        const prompt = `You are a regulatory expert summarizing SEC and Canadian regulatory updates for Asset Management Companies.

Title: ${title}
Regulator: ${regulator}
Description: ${description}

Please generate a comprehensive 150-200 word summary that:
1. Starts with the key regulatory update
2. Explains what the update is about in clear terms
3. Provides context on why it matters for the industry
4. Mentions any important dates or deadlines if relevant
5. Explains the practical implications

The summary should be professional, clear, and suitable for Asset Management Company compliance teams.
Write only the summary text, no headers or labels.`;

        const message = await openai.messages.create({
          model: 'gpt-4.1-mini',
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        let summary = message.content[0].type === 'text' ? message.content[0].text : description;

        // Ensure minimum 150 words
        const wordCount = summary.split(/\s+/).length;
        if (wordCount < 150) {
          summary += `\n\nThis ${regulator} update is important for Asset Management Companies to understand and implement. Firms should review their compliance procedures and ensure alignment with the new requirements. For more details, please visit the official ${regulator} website or contact your compliance team.`;
        }

        return summary;
      } catch (apiError) {
        console.warn(`⚠️  OpenAI API call failed: ${apiError.message}. Using manual expansion.`);
        return expandDescriptionManually(title, description, regulator);
      }
    } else {
      // Use manual expansion if OpenAI is not available
      return expandDescriptionManually(title, description, regulator);
    }
  } catch (error) {
    console.error('❌ Summarization Error:', error.message);
    return expandDescriptionManually(title, description, regulator);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// MANUAL EXPANSION FALLBACK - ENSURES 150+ WORDS
// ════════════════════════════════════════════════════════════════════════════════

function expandDescriptionManually(title, description, regulator) {
  const titleLower = title.toLowerCase();
  
  // Start with the description
  let expanded = description;
  
  // Add primary context based on keywords
  let contextAdded = false;
  
  if (titleLower.includes('enforcement')) {
    expanded += ` This enforcement action demonstrates ${regulator}'s commitment to market oversight and investor protection. Asset Management Companies should review their compliance procedures to ensure they are not engaging in similar practices. The regulator has identified specific violations and imposed sanctions to deter future misconduct. Firms should use this enforcement case as a learning opportunity to strengthen their compliance programs and training. Compliance teams should assess whether any similar issues exist within their organization and take corrective action immediately. This case highlights the importance of robust compliance controls and regular monitoring of regulatory requirements.`;
    contextAdded = true;
  } else if (titleLower.includes('rule') || titleLower.includes('regulation')) {
    expanded += ` This new rule represents an important change to the regulatory framework that Asset Management Companies must comply with. The rule is designed to enhance investor protection and improve market integrity. Firms should carefully review the requirements and assess the impact on their current business practices. Implementation timelines and compliance deadlines are critical to note. Companies should begin planning for compliance immediately to avoid potential violations. Legal and compliance teams should work together to update policies and procedures accordingly. Regular monitoring of the implementation process will be necessary to ensure ongoing compliance.`;
    contextAdded = true;
  } else if (titleLower.includes('guidance')) {
    expanded += ` This guidance from ${regulator} provides important clarification on regulatory expectations and best practices. Asset Management Companies should use this guidance to enhance their compliance programs and operational procedures. The guidance reflects the regulator's current thinking on how existing rules should be applied. Firms should update their policies and procedures to align with the guidance provided. Staff training on the new guidance is recommended to ensure consistent implementation across the organization. Regular reviews of compliance with the guidance should be conducted to verify effectiveness. This guidance may be referenced in future regulatory examinations and enforcement actions.`;
    contextAdded = true;
  } else if (titleLower.includes('alert') || titleLower.includes('warning')) {
    expanded += ` This alert from ${regulator} highlights emerging risks and compliance issues that Asset Management Companies should be aware of. The regulator has identified specific areas of concern and is warning market participants to take preventive action. Firms should assess their exposure to the highlighted risks and implement appropriate safeguards. Ongoing monitoring and periodic reviews of controls are recommended to address the issues raised. Communication with clients and stakeholders may be necessary to address concerns related to this alert. This alert signals areas where the regulator is likely to focus its examination and enforcement efforts.`;
    contextAdded = true;
  } else if (titleLower.includes('mutual fund') || titleLower.includes('fund')) {
    expanded += ` This update is particularly relevant for Asset Management Companies that manage mutual funds or other investment funds. The update addresses fund-specific requirements related to operations, disclosures, or investor protection. Fund managers should review their fund documentation, prospectuses, and operational procedures to ensure compliance. Any required changes should be implemented within the specified timelines. Communication with fund investors may be required to address changes to fund operations or disclosures. Fund boards should be informed of the update and any required compliance actions. This update may have implications for fund marketing materials and investor communications.`;
    contextAdded = true;
  } else if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
    expanded += ` This update addresses disclosure and reporting requirements that Asset Management Companies must follow. Enhanced disclosure is intended to improve transparency and help investors make informed decisions. Firms should review their current disclosure practices and update templates and procedures as needed. Compliance teams should ensure that all required information is being disclosed accurately and timely. Regular audits of disclosure practices should be conducted to ensure ongoing compliance with requirements. Client communications and marketing materials may need to be updated to reflect new disclosure requirements. Documentation of disclosure practices should be maintained to demonstrate compliance.`;
    contextAdded = true;
  } else if (titleLower.includes('fee') || titleLower.includes('compensation')) {
    expanded += ` This update relates to fee structures and compensation arrangements for Asset Management Companies. The regulator is focused on ensuring fair pricing and proper disclosure of fees to clients. Firms should review their fee arrangements and ensure they are reasonable and properly disclosed. Any changes to fee structures should be communicated to clients in accordance with regulatory requirements. Documentation of fee justifications and reasonableness analyses should be maintained. Client agreements may need to be updated to reflect changes to fee arrangements. This update emphasizes the regulator's focus on investor protection and fair dealing in the asset management industry.`;
    contextAdded = true;
  } else if (titleLower.includes('conflict')) {
    expanded += ` This update emphasizes the importance of managing and disclosing conflicts of interest. Asset Management Companies must have robust policies and procedures to identify and manage conflicts. Firms should review their conflict of interest policies and ensure they are comprehensive and effective. Staff should be trained on identifying and managing conflicts appropriately. Regular reviews of conflict management procedures should be conducted to ensure effectiveness. Documentation of conflicts and conflict management decisions should be maintained. This update reflects the regulator's ongoing focus on ensuring that firms act in the best interests of their clients.`;
    contextAdded = true;
  } else if (titleLower.includes('cybersecurity') || titleLower.includes('data') || titleLower.includes('security')) {
    expanded += ` This update addresses cybersecurity and data protection requirements for Asset Management Companies. The regulator is focused on ensuring firms have adequate safeguards to protect client data and systems. Firms should review their cybersecurity policies and procedures and ensure they meet regulatory expectations. Regular security assessments and updates to security measures should be conducted. Staff training on cybersecurity best practices is recommended to reduce risks. Incident response procedures should be in place to address potential security breaches. This update reflects the growing importance of cybersecurity in the financial services industry.`;
    contextAdded = true;
  }
  
  // If no specific context was added, add generic context
  if (!contextAdded) {
    expanded += ` This regulatory update from ${regulator} is important for Asset Management Companies to monitor and understand. The update may affect compliance requirements, operational procedures, or business practices. Firms should assess the impact on their specific business and implement any necessary changes. Staying informed about regulatory developments is essential for maintaining compliance and managing risk. Regular monitoring of regulatory announcements and updates is recommended. Compliance teams should review the update and determine what actions are needed. Management should be briefed on the implications of this regulatory development.`;
  }
  
  // Ensure we have at least 150 words
  let wordCount = expanded.split(/\s+/).length;
  
  // If still under 150 words, add more context
  if (wordCount < 150) {
    expanded += ` For Asset Management Companies, staying compliant with regulatory requirements is essential for maintaining their license and reputation. Firms should establish a process for monitoring regulatory updates and assessing their impact. Compliance calendars should be updated to reflect any new deadlines or requirements. Staff should be trained on the implications of this update for their specific roles. Documentation of compliance efforts should be maintained to demonstrate adherence to regulatory requirements. Firms should consider consulting with legal and compliance experts if they have questions about the update.`;
  }
  
  return expanded;
}

// ════════════════════════════════════════════════════════════════════════════════
// GENERATE "WHY IT MATTERS" SECTION
// ════════════════════════════════════════════════════════════════════════════════

function generateWhyItMatters(title, description, regulator) {
  const titleLower = title.toLowerCase();

  // Map keywords to AMC impact
  let impact = '';

  if (titleLower.includes('enforcement')) {
    impact = `This enforcement action from ${regulator} demonstrates regulatory priorities and compliance expectations. Asset Management Companies must review their policies to ensure alignment with enforcement themes and avoid similar violations. The case highlights specific compliance gaps and the consequences of non-compliance. Firms should use this as an opportunity to strengthen their compliance programs.`;
  } else if (titleLower.includes('rule') || titleLower.includes('regulation')) {
    impact = `This new rule from ${regulator} will directly impact how Asset Management Companies operate, manage client assets, and report to regulators. Compliance teams must update procedures to meet new requirements. The rule may affect business practices, operational costs, and client relationships. Early planning for compliance is essential to meet implementation deadlines.`;
  } else if (titleLower.includes('guidance')) {
    impact = `${regulator} has provided guidance on regulatory expectations. Asset Management Companies should use this to enhance their compliance programs and operational practices. The guidance clarifies how existing rules should be applied in practice. Firms should update their policies and procedures to align with the guidance.`;
  } else if (titleLower.includes('alert') || titleLower.includes('warning')) {
    impact = `This alert from ${regulator} highlights emerging risks and compliance issues. Asset Management Companies should assess their exposure and implement preventive measures. The alert signals areas where the regulator is focusing its oversight efforts. Proactive risk management is essential to avoid regulatory issues.`;
  } else if (titleLower.includes('mutual fund') || titleLower.includes('fund')) {
    impact = `This update is particularly relevant for Asset Management Companies managing mutual funds. Fund-specific requirements affect fund operations, investor protection, and regulatory compliance. Fund managers must ensure their funds comply with all applicable requirements. Fund boards should be informed of the update and any required actions.`;
  } else if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
    impact = `Enhanced disclosure requirements from ${regulator} improve transparency for investors. Asset Management Companies must ensure accurate and timely disclosure of material information. Improved disclosure practices strengthen investor confidence and regulatory compliance. Firms should review their disclosure procedures to ensure they meet new requirements.`;
  } else if (titleLower.includes('fee') || titleLower.includes('compensation')) {
    impact = `This update from ${regulator} addresses fee transparency and fairness. Asset Management Companies must ensure fees are reasonable and properly disclosed to clients. Fee arrangements are a key area of regulatory focus and client concern. Firms should review their fee structures and ensure they are compliant.`;
  } else if (titleLower.includes('conflict')) {
    impact = `This update emphasizes the importance of managing and disclosing conflicts of interest. Asset Management Companies must have robust policies and procedures to identify and manage conflicts. Proper conflict management protects clients and reduces regulatory risk. Firms should ensure their conflict management procedures are effective and comprehensive.`;
  } else if (titleLower.includes('cybersecurity') || titleLower.includes('data') || titleLower.includes('security')) {
    impact = `This update addresses cybersecurity and data protection requirements. Asset Management Companies must ensure they have adequate safeguards to protect client data and systems. Strong cybersecurity practices reduce operational risk and regulatory exposure. Firms should review their security measures and ensure they meet regulatory expectations.`;
  } else {
    impact = `This update from ${regulator} is relevant to Asset Management Companies' regulatory compliance and operational framework. Understanding the implications is essential for maintaining regulatory standing and protecting clients. Regulatory changes often require operational adjustments and staff training. Firms should assess the impact on their business and implement necessary changes.`;
  }

  return impact;
}

// ════════════════════════════════════════════════════════════════════════════════
// GENERATE "ACTIONS NEEDED" SECTION
// ════════════════════════════════════════════════════════════════════════════════

function generateActionsNeeded(title, description, regulator) {
  const titleLower = title.toLowerCase();

  // Base actions by category
  let actions = [];

  if (titleLower.includes('enforcement')) {
    actions = [
      '1. Review the enforcement action in detail',
      '2. Identify any similar practices in your firm',
      '3. Assess compliance with the violated rule',
      '4. Implement corrective measures and enhanced monitoring',
      '5. Train relevant staff on compliance obligations',
      '6. Document remediation efforts',
      '7. Report findings to management and board if necessary'
    ];
  } else if (titleLower.includes('rule') || titleLower.includes('regulation')) {
    actions = [
      '1. Review the new rule with compliance and legal teams',
      '2. Assess impact on current business practices',
      '3. Identify implementation timeline and deadlines',
      '4. Update compliance procedures and controls',
      '5. Train staff on new requirements',
      '6. Implement systems changes if needed',
      '7. Document compliance with new rule'
    ];
  } else if (titleLower.includes('guidance')) {
    actions = [
      '1. Review guidance with compliance team',
      '2. Assess alignment with current practices',
      '3. Update policies and procedures as needed',
      '4. Train staff on regulatory expectations',
      '5. Document compliance approach',
      '6. Monitor for any follow-up guidance',
      '7. Brief management on implications'
    ];
  } else if (titleLower.includes('alert') || titleLower.includes('warning')) {
    actions = [
      '1. Distribute alert to relevant departments',
      '2. Assess firm\'s exposure to highlighted risks',
      '3. Review current controls and procedures',
      '4. Implement additional monitoring or safeguards',
      '5. Update risk assessment and compliance calendar',
      '6. Train staff on risk mitigation',
      '7. Document preventive measures taken'
    ];
  } else if (titleLower.includes('mutual fund') || titleLower.includes('fund')) {
    actions = [
      '1. Review fund-specific requirements in detail',
      '2. Assess impact on fund operations',
      '3. Review fund prospectuses and marketing materials',
      '4. Update fund policies and procedures',
      '5. Implement required changes',
      '6. Train fund management staff',
      '7. Document compliance efforts'
    ];
  } else if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
    actions = [
      '1. Review disclosure requirements',
      '2. Update disclosure templates and procedures',
      '3. Assess current disclosure practices',
      '4. Implement required changes',
      '5. Train staff on disclosure obligations',
      '6. Review client communications',
      '7. Document compliance efforts'
    ];
  } else if (titleLower.includes('fee') || titleLower.includes('compensation')) {
    actions = [
      '1. Review current fee arrangements',
      '2. Assess fee reasonableness',
      '3. Review fee disclosure to clients',
      '4. Update fee schedules if needed',
      '5. Communicate changes to clients',
      '6. Train staff on fee requirements',
      '7. Document compliance efforts'
    ];
  } else if (titleLower.includes('conflict')) {
    actions = [
      '1. Review conflict of interest policies',
      '2. Identify potential conflicts in your firm',
      '3. Assess conflict management procedures',
      '4. Update policies and procedures as needed',
      '5. Train staff on conflict management',
      '6. Document conflict disclosures',
      '7. Monitor for new conflicts'
    ];
  } else if (titleLower.includes('cybersecurity') || titleLower.includes('data') || titleLower.includes('security')) {
    actions = [
      '1. Review current cybersecurity policies',
      '2. Assess data protection measures',
      '3. Identify potential security gaps',
      '4. Implement security improvements',
      '5. Train staff on cybersecurity best practices',
      '6. Conduct security assessments',
      '7. Document security measures and compliance'
    ];
  } else {
    actions = [
      '1. Review the update with compliance team',
      '2. Assess impact on your firm',
      '3. Update policies and procedures if needed',
      '4. Train relevant staff',
      '5. Implement required changes',
      '6. Document compliance efforts',
      '7. Monitor for follow-up guidance'
    ];
  }

  return actions.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════════
// GENERATE COMPLETE ENHANCED SUMMARY OBJECT
// ════════════════════════════════════════════════════════════════════════════════

async function generateEnhancedSummary(article) {
  const {
    title = '',
    description = '',
    regulator = 'Unknown',
    category = 'press'
  } = article;

  // Generate 150+ word summary
  const summary = await generateSummary(title, description, regulator);
  
  // Generate why it matters
  const why_it_matters = generateWhyItMatters(title, description, regulator);
  
  // Generate actions needed
  const actions_needed = generateActionsNeeded(title, description, regulator);

  return {
    summary,
    why_it_matters,
    actions_needed,
    summarization_version: '2.0'
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
  generateSummary,
  generateWhyItMatters,
  generateActionsNeeded,
  generateEnhancedSummary,
  expandDescriptionManually
};
