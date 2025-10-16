import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { dataPresenceScore } from '../VibeScore/income/metrics.js';
import {
  REQUIRED_PROFILE_WEIGHTS,
  UNEMPLOYMENT_DATA,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_RISK_OPTIONS,
  BONUS_RELIABILITY_OPTIONS,
  SKILL_DEMAND_OPTIONS
} from './income-profile-constants.js';

const profileElements = {
  identityBlurb: document.getElementById('profile-identity-blurb'),
  progressMeta: document.getElementById('profile-progress-meta'),
  summarySection: document.getElementById('profile-summary-section'),
  detailsSection: document.getElementById('profile-details-section'),
  emptyState: document.getElementById('profile-empty-state'),
  emptyLaunchBtn: document.getElementById('profile-empty-launch'),
  
  // Summary cards
  completionMessage: document.getElementById('summary-completion-message'),
  completionValue: document.getElementById('summary-completion-value'),
  completionBar: document.getElementById('summary-completion-bar'),
  completionUpdated: document.getElementById('summary-completion-updated'),
  
  stabilityText: document.getElementById('summary-stability-text'),
  stabilityList: document.getElementById('summary-stability-list'),
  
  opportunityText: document.getElementById('summary-opportunity-text'),
  opportunityList: document.getElementById('summary-opportunity-list'),
  
  safetyText: document.getElementById('summary-safety-text'),
  safetyList: document.getElementById('summary-safety-list'),
  
  // Details container
  profileSections: document.getElementById('profile-sections')
};

let profileState = {
  userId: null,
  profileData: {},
  profileMeta: {}
};

// Helper functions
function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Not updated yet';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch (e) {
    return 'Recently';
  }
}

function getProfileCompletionScore() {
  const presence = dataPresenceScore(profileState.profileData, REQUIRED_PROFILE_WEIGHTS) || { score: 0 };
  const raw = Number.isFinite(presence.score) ? presence.score : 0;
  return {
    raw,
    rounded: Math.round(raw)
  };
}

function getLabelForValue(value, options) {
  const option = options.find(opt => opt.value === value);
  return option ? option.label : value;
}

function getUnemploymentLabel(data) {
  if (!data || !data.state) return null;
  const stateData = UNEMPLOYMENT_DATA.find(s => s.state === data.state);
  if (!stateData) return null;
  
  const cityData = stateData.cities.find(c => c.city === data.city);
  if (cityData) {
    return `${cityData.label}, ${stateData.label}`;
  }
  return stateData.label;
}

function getUnemploymentRate(data) {
  if (!data || !data.state) return null;
  const stateData = UNEMPLOYMENT_DATA.find(s => s.state === data.state);
  if (!stateData) return null;
  
  const cityData = stateData.cities.find(c => c.city === data.city);
  return cityData ? cityData.rate : null;
}

// Generate identity blurb
function generateIdentityBlurb() {
  const { employmentType, roleTitle, companyName, tenureMonths } = profileState.profileData;
  
  if (!employmentType) {
    return 'We&rsquo;ll use your responses to describe your income outlook here.';
  }
  
  const employmentLabel = getLabelForValue(employmentType, EMPLOYMENT_OPTIONS) || 'Professional';
  let parts = [];
  
  if (roleTitle && companyName) {
    parts.push(`You work as a <strong>${escapeHtml(roleTitle)}</strong> at <strong>${escapeHtml(companyName)}</strong>`);
  } else if (roleTitle) {
    parts.push(`You work as a <strong>${escapeHtml(roleTitle)}</strong>`);
  } else if (companyName) {
    parts.push(`You work at <strong>${escapeHtml(companyName)}</strong>`);
  } else {
    parts.push(`You're a <strong>${escapeHtml(employmentLabel)}</strong>`);
  }
  
  if (tenureMonths && typeof tenureMonths === 'object') {
    const years = tenureMonths.years || 0;
    const months = tenureMonths.months || 0;
    const totalMonths = (years * 12) + months;
    
    if (totalMonths > 0) {
      let tenureText = '';
      if (years > 0 && months > 0) {
        tenureText = `${years} year${years > 1 ? 's' : ''} and ${months} month${months > 1 ? 's' : ''}`;
      } else if (years > 0) {
        tenureText = `${years} year${years > 1 ? 's' : ''}`;
      } else {
        tenureText = `${months} month${months > 1 ? 's' : ''}`;
      }
      parts.push(` with <strong>${tenureText}</strong> in your current role`);
    }
  }
  
  return parts.join('') + '.';
}

// Update completion card
function updateCompletionCard() {
  const completion = getProfileCompletionScore();
  const percentage = completion.rounded;
  
  if (profileElements.completionValue) {
    profileElements.completionValue.textContent = `${percentage}%`;
  }
  
  if (profileElements.completionBar) {
    profileElements.completionBar.style.width = `${percentage}%`;
  }
  
  if (profileElements.completionMessage) {
    let message = 'No responses recorded yet';
    if (percentage >= 95) {
      message = 'Profile complete';
    } else if (percentage >= 75) {
      message = 'Nearly there';
    } else if (percentage >= 50) {
      message = 'Good progress';
    } else if (percentage >= 25) {
      message = 'Getting started';
    } else if (percentage > 0) {
      message = 'Just begun';
    }
    profileElements.completionMessage.textContent = message;
  }
  
  if (profileElements.completionUpdated) {
    profileElements.completionUpdated.textContent = formatDate(profileState.profileMeta.lastUpdated);
  }
}

// Generate stability insights
function generateStabilityInsights() {
  const { 
    employmentType, 
    tenureMonths, 
    industryRisk, 
    regionalUnemploymentRate,
    layoffHistory,
    upcomingContractRenewal
  } = profileState.profileData;
  
  const insights = [];
  
  // Employment type insight
  if (employmentType) {
    const typeLabel = getLabelForValue(employmentType, EMPLOYMENT_OPTIONS);
    const stability = ['w2', 'salaried', 'full-time'].includes(employmentType) ? 'high' : 'moderate';
    insights.push({
      label: typeLabel,
      type: stability,
      icon: stability === 'high' ? '✓' : '•'
    });
  }
  
  // Tenure insight
  if (tenureMonths && typeof tenureMonths === 'object') {
    const totalMonths = ((tenureMonths.years || 0) * 12) + (tenureMonths.months || 0);
    let tenureLabel = `${Math.floor(totalMonths / 12)}y ${totalMonths % 12}m tenure`;
    let tenureType = 'moderate';
    
    if (totalMonths >= 24) {
      tenureType = 'high';
    } else if (totalMonths < 6) {
      tenureType = 'low';
    }
    
    insights.push({
      label: tenureLabel,
      type: tenureType,
      icon: tenureType === 'high' ? '✓' : '•'
    });
  }
  
  // Industry risk insight
  if (industryRisk) {
    const riskLabel = getLabelForValue(industryRisk, INDUSTRY_RISK_OPTIONS);
    const riskType = ['very-low', 'low'].includes(industryRisk) ? 'high' : 
                     ['moderate'].includes(industryRisk) ? 'moderate' : 'low';
    
    insights.push({
      label: `${riskLabel} industry outlook`,
      type: riskType,
      icon: riskType === 'high' ? '✓' : riskType === 'moderate' ? '•' : '⚠'
    });
  }
  
  // Regional unemployment
  if (regionalUnemploymentRate) {
    const location = getUnemploymentLabel(regionalUnemploymentRate);
    const rate = getUnemploymentRate(regionalUnemploymentRate);
    
    if (location && rate) {
      const rateType = rate <= 3.5 ? 'high' : rate <= 5.0 ? 'moderate' : 'low';
      insights.push({
        label: `${rate}% unemployment in ${location}`,
        type: rateType,
        icon: rateType === 'high' ? '✓' : '•'
      });
    }
  }
  
  // Layoff history warning
  if (layoffHistory && layoffHistory > 0) {
    insights.push({
      label: `${layoffHistory} layoff${layoffHistory > 1 ? 's' : ''} in last 5 years`,
      type: 'low',
      icon: '⚠'
    });
  }
  
  // Contract renewal warning
  if (upcomingContractRenewal) {
    insights.push({
      label: 'Contract renewal coming soon',
      type: 'moderate',
      icon: '•'
    });
  }
  
  return insights;
}

// Generate opportunity insights
function generateOpportunityInsights() {
  const {
    promotionPipeline,
    upskillingProgress,
    skillDemand,
    roleSatisfaction,
    bonusReliability
  } = profileState.profileData;
  
  const insights = [];
  
  // Promotion pipeline
  if (promotionPipeline !== undefined && promotionPipeline !== null) {
    const percentage = Number(promotionPipeline);
    let type = 'moderate';
    let label = `${percentage}% promotion likelihood`;
    
    if (percentage >= 70) {
      type = 'high';
      label = `Strong promotion odds (${percentage}%)`;
    } else if (percentage >= 40) {
      label = `Moderate promotion chance (${percentage}%)`;
    } else if (percentage > 0) {
      type = 'low';
      label = `Low promotion likelihood (${percentage}%)`;
    }
    
    insights.push({
      label,
      type,
      icon: type === 'high' ? '↑' : '•'
    });
  }
  
  // Upskilling progress
  if (upskillingProgress !== undefined && upskillingProgress !== null) {
    const percentage = Number(upskillingProgress);
    if (percentage > 0) {
      const type = percentage >= 50 ? 'high' : 'moderate';
      insights.push({
        label: `${percentage}% through upskilling goals`,
        type,
        icon: type === 'high' ? '✓' : '•'
      });
    }
  }
  
  // Skill demand
  if (skillDemand) {
    const demandLabel = getLabelForValue(skillDemand, SKILL_DEMAND_OPTIONS);
    const demandType = ['scarce', 'strong'].includes(skillDemand) ? 'high' :
                       ['balanced'].includes(skillDemand) ? 'moderate' : 'low';
    
    insights.push({
      label: `${demandLabel} skills`,
      type: demandType,
      icon: demandType === 'high' ? '↑' : '•'
    });
  }
  
  // Role satisfaction
  if (roleSatisfaction !== undefined && roleSatisfaction !== null) {
    const percentage = Number(roleSatisfaction);
    let type = 'moderate';
    let label = `${percentage}% role satisfaction`;
    
    if (percentage >= 75) {
      type = 'high';
      label = `High satisfaction (${percentage}%)`;
    } else if (percentage < 50) {
      type = 'low';
      label = `Low satisfaction (${percentage}%)`;
    }
    
    insights.push({
      label,
      type,
      icon: type === 'high' ? '✓' : type === 'low' ? '⚠' : '•'
    });
  }
  
  // Bonus reliability
  if (bonusReliability) {
    const reliabilityLabel = getLabelForValue(bonusReliability, BONUS_RELIABILITY_OPTIONS);
    if (bonusReliability !== 'none') {
      const reliabilityType = bonusReliability === 'high' ? 'high' :
                              bonusReliability === 'medium' ? 'moderate' : 'low';
      
      insights.push({
        label: `${reliabilityLabel} variable pay`,
        type: reliabilityType,
        icon: reliabilityType === 'high' ? '✓' : '•'
      });
    }
  }
  
  return insights;
}

// Generate safety net insights
function generateSafetyInsights() {
  const {
    emergencyFundMonths,
    incomeProtectionCoverage,
    savingsRateOverride,
    plannedMajorExpense
  } = profileState.profileData;
  
  const insights = [];
  
  // Emergency fund
  if (emergencyFundMonths !== undefined && emergencyFundMonths !== null) {
    const months = Number(emergencyFundMonths);
    let type = 'moderate';
    let label = `${months} month${months !== 1 ? 's' : ''} emergency fund`;
    
    if (months >= 6) {
      type = 'high';
      label = `Strong ${months}-month emergency fund`;
    } else if (months >= 3) {
      label = `${months}-month emergency cushion`;
    } else if (months > 0) {
      type = 'low';
      label = `Limited ${months}-month emergency fund`;
    } else {
      type = 'low';
      label = 'No emergency fund set';
    }
    
    insights.push({
      label,
      type,
      icon: type === 'high' ? '✓' : type === 'low' ? '⚠' : '•'
    });
  }
  
  // Income protection coverage
  if (incomeProtectionCoverage && Array.isArray(incomeProtectionCoverage) && incomeProtectionCoverage.length > 0) {
    const coverageTypes = incomeProtectionCoverage.map(c => {
      switch(c) {
        case 'disability': return 'Disability insurance';
        case 'employer-std': return 'Short-term disability';
        case 'employer-ltd': return 'Long-term disability';
        case 'supplemental': return 'Supplemental coverage';
        default: return c;
      }
    });
    
    insights.push({
      label: coverageTypes.join(', '),
      type: 'high',
      icon: '✓'
    });
  }
  
  // Savings rate
  if (savingsRateOverride !== undefined && savingsRateOverride !== null) {
    const rate = Number(savingsRateOverride);
    if (rate > 0) {
      const type = rate >= 20 ? 'high' : rate >= 10 ? 'moderate' : 'low';
      insights.push({
        label: `${rate}% savings rate`,
        type,
        icon: type === 'high' ? '✓' : '•'
      });
    }
  }
  
  // Planned major expense
  if (plannedMajorExpense) {
    insights.push({
      label: 'Major expense planned soon',
      type: 'moderate',
      icon: '•'
    });
  }
  
  return insights;
}

// Render insight list
function renderInsightList(insights, container) {
  if (!container) return;
  
  if (insights.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const html = insights.map(insight => {
    const typeClass = insight.type === 'high' ? 'text-[var(--neon,#CCFF00)]' :
                      insight.type === 'low' ? 'text-orange-400' : 'text-neutral-400';
    
    return `
      <li class="flex items-start gap-2">
        <span class="${typeClass} text-lg leading-none" aria-hidden="true">${insight.icon}</span>
        <span class="text-neutral-300 flex-1">${escapeHtml(insight.label)}</span>
      </li>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Generate detailed profile sections
function generateDetailedSections() {
  if (!profileElements.profileSections) return;
  
  const sections = [];
  
  // Work Overview Section
  const workData = [];
  if (profileState.profileData.employmentType) {
    workData.push({
      label: 'Employment type',
      value: getLabelForValue(profileState.profileData.employmentType, EMPLOYMENT_OPTIONS)
    });
  }
  if (profileState.profileData.roleTitle) {
    workData.push({
      label: 'Role',
      value: profileState.profileData.roleTitle
    });
  }
  if (profileState.profileData.companyName) {
    workData.push({
      label: 'Company',
      value: profileState.profileData.companyName
    });
  }
  if (profileState.profileData.tenureMonths) {
    const { years = 0, months = 0 } = profileState.profileData.tenureMonths;
    const totalMonths = (years * 12) + months;
    if (totalMonths > 0) {
      let tenureText = '';
      if (years > 0 && months > 0) {
        tenureText = `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}`;
      } else if (years > 0) {
        tenureText = `${years} year${years > 1 ? 's' : ''}`;
      } else {
        tenureText = `${months} month${months > 1 ? 's' : ''}`;
      }
      workData.push({
        label: 'Tenure',
        value: tenureText
      });
    }
  }
  
  if (workData.length > 0) {
    sections.push({
      title: 'Work Overview',
      icon: '→',
      data: workData
    });
  }
  
  // Stability Factors Section
  const stabilityData = [];
  if (profileState.profileData.industryRisk) {
    stabilityData.push({
      label: 'Industry outlook',
      value: getLabelForValue(profileState.profileData.industryRisk, INDUSTRY_RISK_OPTIONS)
    });
  }
  if (profileState.profileData.regionalUnemploymentRate) {
    const location = getUnemploymentLabel(profileState.profileData.regionalUnemploymentRate);
    const rate = getUnemploymentRate(profileState.profileData.regionalUnemploymentRate);
    if (location && rate) {
      stabilityData.push({
        label: 'Regional market',
        value: `${location} (${rate}% unemployment)`
      });
    }
  }
  if (profileState.profileData.layoffHistory !== undefined && profileState.profileData.layoffHistory !== null) {
    stabilityData.push({
      label: 'Layoffs (5 years)',
      value: profileState.profileData.layoffHistory === 0 ? 'None' : String(profileState.profileData.layoffHistory)
    });
  }
  if (profileState.profileData.upcomingContractRenewal) {
    stabilityData.push({
      label: 'Contract renewal',
      value: 'Coming in next 6 months'
    });
  }
  
  if (stabilityData.length > 0) {
    sections.push({
      title: 'Stability Factors',
      icon: '→',
      data: stabilityData
    });
  }
  
  // Income Reliability Section
  const incomeData = [];
  if (profileState.profileData.bonusReliability) {
    incomeData.push({
      label: 'Variable pay reliability',
      value: getLabelForValue(profileState.profileData.bonusReliability, BONUS_RELIABILITY_OPTIONS)
    });
  }
  if (profileState.profileData.savingsRateOverride !== undefined && profileState.profileData.savingsRateOverride !== null) {
    incomeData.push({
      label: 'Savings rate',
      value: `${profileState.profileData.savingsRateOverride}%`
    });
  }
  if (profileState.profileData.incomeProtectionCoverage && Array.isArray(profileState.profileData.incomeProtectionCoverage)) {
    if (profileState.profileData.incomeProtectionCoverage.length > 0) {
      const coverageLabels = profileState.profileData.incomeProtectionCoverage.map(c => {
        switch(c) {
          case 'disability': return 'Disability insurance';
          case 'employer-std': return 'Short-term disability';
          case 'employer-ltd': return 'Long-term disability';
          case 'supplemental': return 'Supplemental coverage';
          default: return c;
        }
      });
      incomeData.push({
        label: 'Income protection',
        value: coverageLabels.join(', ')
      });
    } else {
      incomeData.push({
        label: 'Income protection',
        value: 'None'
      });
    }
  }
  
  if (incomeData.length > 0) {
    sections.push({
      title: 'Income Reliability',
      icon: '→',
      data: incomeData
    });
  }
  
  // Growth & Opportunity Section
  const growthData = [];
  if (profileState.profileData.promotionPipeline !== undefined && profileState.profileData.promotionPipeline !== null) {
    growthData.push({
      label: 'Promotion likelihood',
      value: `${profileState.profileData.promotionPipeline}%`
    });
  }
  if (profileState.profileData.upskillingProgress !== undefined && profileState.profileData.upskillingProgress !== null) {
    growthData.push({
      label: 'Upskilling progress',
      value: `${profileState.profileData.upskillingProgress}%`
    });
  }
  if (profileState.profileData.skillDemand) {
    growthData.push({
      label: 'Skill market demand',
      value: getLabelForValue(profileState.profileData.skillDemand, SKILL_DEMAND_OPTIONS)
    });
  }
  if (profileState.profileData.roleSatisfaction !== undefined && profileState.profileData.roleSatisfaction !== null) {
    growthData.push({
      label: 'Role satisfaction',
      value: `${profileState.profileData.roleSatisfaction}%`
    });
  }
  
  if (growthData.length > 0) {
    sections.push({
      title: 'Growth & Opportunity',
      icon: '→',
      data: growthData
    });
  }
  
  // Safety Net Section
  const safetyData = [];
  if (profileState.profileData.emergencyFundMonths !== undefined && profileState.profileData.emergencyFundMonths !== null) {
    const months = Number(profileState.profileData.emergencyFundMonths);
    safetyData.push({
      label: 'Emergency fund',
      value: months === 0 ? 'Not set' : `${months} month${months !== 1 ? 's' : ''}`
    });
  }
  if (profileState.profileData.plannedMajorExpense) {
    safetyData.push({
      label: 'Major expense',
      value: 'Planned in next 6 months'
    });
  }
  
  if (safetyData.length > 0) {
    sections.push({
      title: 'Safety Net',
      icon: '→',
      data: safetyData
    });
  }
  
  // Additional Notes
  if (profileState.profileData.incomeNotes && profileState.profileData.incomeNotes.trim()) {
    sections.push({
      title: 'Additional Context',
      icon: '→',
      note: profileState.profileData.incomeNotes
    });
  }
  
  // Render sections
  const html = sections.map(section => {
    if (section.note) {
      return `
        <article class="rounded-3xl border border-neutral-900 bg-neutral-950/50 px-8 py-8">
          <div class="flex items-center gap-3 mb-6">
            <span class="text-2xl" aria-hidden="true">${section.icon}</span>
            <h3 class="text-xl font-semibold text-white">${escapeHtml(section.title)}</h3>
          </div>
          <div class="prose prose-invert max-w-none">
            <p class="text-neutral-300 whitespace-pre-wrap">${escapeHtml(section.note)}</p>
          </div>
        </article>
      `;
    }
    
    return `
      <article class="rounded-3xl border border-neutral-900 bg-neutral-950/50 px-8 py-8">
        <div class="flex items-center gap-3 mb-6">
          <span class="text-2xl" aria-hidden="true">${section.icon}</span>
          <h3 class="text-xl font-semibold text-white">${escapeHtml(section.title)}</h3>
        </div>
        <dl class="grid gap-4 sm:grid-cols-2">
          ${section.data.map(item => `
            <div class="flex flex-col gap-1">
              <dt class="text-xs uppercase tracking-[0.2em] text-neutral-500">${escapeHtml(item.label)}</dt>
              <dd class="text-base text-neutral-200 font-medium">${escapeHtml(item.value)}</dd>
            </div>
          `).join('')}
        </dl>
      </article>
    `;
  }).join('');
  
  profileElements.profileSections.innerHTML = html;
}

// Update the entire profile display
function updateProfileDisplay() {
  const completion = getProfileCompletionScore();
  const hasData = completion.rounded > 0;
  
  // Update identity blurb
  if (profileElements.identityBlurb) {
    profileElements.identityBlurb.innerHTML = generateIdentityBlurb();
  }
  
  // Update progress meta
  if (profileElements.progressMeta) {
    if (hasData) {
      const stepsCompleted = profileState.profileMeta.completedSteps || 0;
      const totalSteps = 5; // Based on STEPS.length
      const lastUpdate = formatDate(profileState.profileMeta.lastUpdated);
      profileElements.progressMeta.innerHTML = 
        `You've completed <strong>${stepsCompleted} of ${totalSteps} steps</strong>. <strong>${completion.rounded}% complete</strong>. Last updated: ${lastUpdate}`;
    } else {
      profileElements.progressMeta.textContent = 
        'Complete the income profile wizard to generate your personalized overview.';
    }
  }
  
  if (hasData) {
    // Show summary and details sections
    if (profileElements.summarySection) {
      profileElements.summarySection.classList.remove('hidden');
    }
    if (profileElements.detailsSection) {
      profileElements.detailsSection.classList.remove('hidden');
    }
    if (profileElements.emptyState) {
      profileElements.emptyState.classList.add('hidden');
    }
    
    // Update all cards
    updateCompletionCard();
    
    const stabilityInsights = generateStabilityInsights();
    if (stabilityInsights.length > 0) {
      if (profileElements.stabilityText) {
        profileElements.stabilityText.textContent = 
          'Key factors influencing your income steadiness.';
      }
      renderInsightList(stabilityInsights, profileElements.stabilityList);
    }
    
    const opportunityInsights = generateOpportunityInsights();
    if (opportunityInsights.length > 0) {
      if (profileElements.opportunityText) {
        profileElements.opportunityText.textContent = 
          'Your growth trajectory and career momentum signals.';
      }
      renderInsightList(opportunityInsights, profileElements.opportunityList);
    }
    
    const safetyInsights = generateSafetyInsights();
    if (safetyInsights.length > 0) {
      if (profileElements.safetyText) {
        profileElements.safetyText.textContent = 
          'Your financial cushion and protection mechanisms.';
      }
      renderInsightList(safetyInsights, profileElements.safetyList);
    }
    
    // Generate detailed sections
    generateDetailedSections();
    
  } else {
    // Show empty state
    if (profileElements.summarySection) {
      profileElements.summarySection.classList.add('hidden');
    }
    if (profileElements.detailsSection) {
      profileElements.detailsSection.classList.add('hidden');
    }
    if (profileElements.emptyState) {
      profileElements.emptyState.classList.remove('hidden');
    }
  }
}

// Load profile data
async function loadFinancialProfile(uid) {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const incomeData = data?.income?.profile || {};
      const { updatedAt, completedSteps, version, ...profileFields } = incomeData;
      
      profileState.profileData = profileFields;
      profileState.profileMeta = {
        completedSteps: typeof completedSteps === 'number' ? completedSteps : 0,
        lastUpdated: updatedAt
      };
    } else {
      profileState.profileData = {};
      profileState.profileMeta = {};
    }
    
    updateProfileDisplay();
  } catch (error) {
    console.error('Error loading financial profile:', error);
    profileState.profileData = {};
    profileState.profileMeta = {};
    updateProfileDisplay();
  }
}

// Wire up empty state launch button
if (profileElements.emptyLaunchBtn) {
  profileElements.emptyLaunchBtn.addEventListener('click', () => {
    const launchBtn = document.getElementById('income-profile-launch');
    if (launchBtn) {
      launchBtn.click();
    }
  });
}

// Initialize on auth state change
onAuthStateChanged(auth, (user) => {
  if (user) {
    profileState.userId = user.uid;
    loadFinancialProfile(user.uid);
  } else {
    profileState.userId = null;
    profileState.profileData = {};
    profileState.profileMeta = {};
    updateProfileDisplay();
  }
});

// Listen for profile updates from the income profile wizard
document.addEventListener('income-profile:updated', () => {
  if (profileState.userId) {
    loadFinancialProfile(profileState.userId);
  }
});

// Export for potential use by other modules
export { loadFinancialProfile, updateProfileDisplay };
