/**
 * ════════════════════════════════════════════════════════════════════════════════
 * ARTICLE SUMMARIZATION MODULE
 * Generates enhanced summaries for regulatory updates
 * 
 * Features:
 * - Extended summary (50+ words)
 * - Why it matters for Asset Management Companies
 * - Actions needed from AMC perspective
 * ════════════════════════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════════════════════════
// SUMMARIZATION LOGIC
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Generate extended summary from article text
 * @param {string} title - Article title
 * @param {string} fullText - Full article text
 * @param {string} regulator - Regulator name (SEC, OSC, BCSC, etc.)
 * @returns {string} Extended summary (50+ words)
 */
function generateSummary(title, fullText, regulator) {
  if (!fullText || fullText.trim().length === 0) {
    return `${regulator} has issued an update regarding ${title.toLowerCase()}. Please refer to the official source for complete details.`;
  }

  // Extract key sentences
  const sentences = fullText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20)
    .slice(0, 5);

  // Combine sentences into summary
  let summary = sentences.join('. ');

  // Ensure minimum 50 words
  if (summary.split(' ').length < 50) {
    // Add context if summary is too short
    summary += `. This regulatory update from ${regulator} is important for market participants to understand and comply with. The full details are available in the official announcement.`;
  }

  return summary.substring(0, 500) + (summary.length > 500 ? '...' : '');
}

/**
 * Generate "Why It Matters" section for Asset Management Companies
 * @param {string} title - Article title
 * @param {string} fullText - Full article text
 * @param {string} category - Update category
 * @param {string} regulator - Regulator name
 * @returns {string} Why it matters for AMCs
 */
function generateWhyItMatters(title, fullText, category, regulator) {
  const categoryLower = category.toLowerCase();
  const titleLower = title.toLowerCase();

  // Map categories to AMC impact
  const impactMap = {
    'enforcement': `This enforcement action from ${regulator} demonstrates regulatory priorities and compliance expectations. Asset Management Companies must review their policies to ensure alignment with enforcement themes and avoid similar violations.`,
    
    'rules': `This new rule from ${regulator} will directly impact how Asset Management Companies operate, manage client assets, and report to regulators. Compliance teams must update procedures to meet new requirements.`,
    
    'alerts': `This alert from ${regulator} highlights emerging risks and compliance issues. Asset Management Companies should assess their exposure and implement preventive measures.`,
    
    'guidance': `${regulator} has provided guidance on regulatory expectations. Asset Management Companies should use this to enhance their compliance programs and operational practices.`,
    
    'press': `This announcement from ${regulator} signals important regulatory developments. Asset Management Companies should monitor for follow-up rules or enforcement actions.`,
    
    'default': `This update from ${regulator} is relevant to Asset Management Companies' regulatory compliance and operational framework. Understanding the implications is essential for maintaining regulatory standing.`
  };

  // Select appropriate impact statement
  let impact = impactMap[categoryLower] || impactMap['default'];

  // Add specific impacts based on keywords
  if (titleLower.includes('mutual fund') || titleLower.includes('fund')) {
    impact += ' Mutual fund managers should pay particular attention to fund-specific requirements.';
  }
  if (titleLower.includes('investment adviser') || titleLower.includes('adviser')) {
    impact += ' Investment advisers must ensure compliance with adviser-specific obligations.';
  }
  if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
    impact += ' Review disclosure and reporting obligations carefully.';
  }
  if (titleLower.includes('fee') || titleLower.includes('compensation')) {
    impact += ' Fee structures and compensation arrangements may need review.';
  }
  if (titleLower.includes('conflict') || titleLower.includes('conflicts')) {
    impact += ' Conflict of interest policies and procedures should be reviewed.';
  }

  return impact;
}

/**
 * Generate "Actions Needed" section for Asset Management Companies
 * @param {string} title - Article title
 * @param {string} fullText - Full article text
 * @param {string} category - Update category
 * @param {string} regulator - Regulator name
 * @returns {string} Actions needed for AMCs
 */
function generateActionsNeeded(title, fullText, category, regulator) {
  const categoryLower = category.toLowerCase();
  const titleLower = title.toLowerCase();

  // Base actions by category
  const actionMap = {
    'enforcement': [
      '1. Review the enforcement action and identify any similar practices in your firm',
      '2. Assess compliance with the violated rule or principle',
      '3. Implement corrective measures and enhanced monitoring',
      '4. Train relevant staff on compliance obligations',
      '5. Document remediation efforts'
    ],
    
    'rules': [
      '1. Review the new rule in detail with compliance and legal teams',
      '2. Assess impact on current business practices and policies',
      '3. Identify implementation timeline and deadlines',
      '4. Update compliance procedures and controls',
      '5. Train staff on new requirements',
      '6. Implement systems changes if needed',
      '7. Document compliance with new rule'
    ],
    
    'alerts': [
      '1. Distribute alert to relevant departments',
      '2. Assess firm\'s exposure to the highlighted risks',
      '3. Review current controls and procedures',
      '4. Implement additional monitoring or safeguards',
      '5. Update risk assessment and compliance calendar'
    ],
    
    'guidance': [
      '1. Review guidance with compliance team',
      '2. Assess alignment with current practices',
      '3. Update policies and procedures as needed',
      '4. Train staff on regulatory expectations',
      '5. Document compliance approach'
    ],
    
    'press': [
      '1. Monitor for follow-up rules or enforcement actions',
      '2. Subscribe to regulator updates',
      '3. Assess potential impact on business',
      '4. Prepare for potential inquiries or examinations',
      '5. Brief management on regulatory developments'
    ],
    
    'default': [
      '1. Review the update with compliance team',
      '2. Assess impact on your firm',
      '3. Update policies and procedures if needed',
      '4. Train relevant staff',
      '5. Document compliance efforts'
    ]
  };

  let actions = actionMap[categoryLower] || actionMap['default'];

  // Add specific actions based on keywords
  if (titleLower.includes('mutual fund') || titleLower.includes('fund')) {
    actions.push('6. Review fund prospectuses and marketing materials for compliance');
  }
  if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
    actions.push('6. Update disclosure templates and reporting procedures');
  }
  if (titleLower.includes('fee') || titleLower.includes('compensation')) {
    actions.push('6. Review fee arrangements with clients and ensure proper disclosure');
  }
  if (titleLower.includes('conflict') || titleLower.includes('conflicts')) {
    actions.push('6. Review conflict of interest policies and disclosures');
  }
  if (titleLower.includes('cybersecurity') || titleLower.includes('data')) {
    actions.push('6. Review data security and cybersecurity measures');
  }

  return actions.join('\n');
}

/**
 * Generate complete enhanced summary object
 * @param {object} article - Article object with title, text, category, regulator
 * @returns {object} Enhanced summary with all sections
 */
function generateEnhancedSummary(article) {
  const {
    title = '',
    fullText = '',
    category = 'press',
    regulator = 'Unknown',
    description = ''
  } = article;

  const summary = generateSummary(title, fullText || description, regulator);
  const whyItMatters = generateWhyItMatters(title, fullText || description, category, regulator);
  const actionsNeeded = generateActionsNeeded(title, fullText || description, category, regulator);

  return {
    summary,
    why_it_matters: whyItMatters,
    actions_needed: actionsNeeded,
    summarization_version: '1.0'
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
  generateSummary,
  generateWhyItMatters,
  generateActionsNeeded,
  generateEnhancedSummary
};
