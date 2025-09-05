// Phase 3: Rule Engine - functional approach following gmail-todo-agent patterns
import { EmailData } from '../core/types';
import { addLabelToEmail } from './gmail';

// Types matching original rule-engine.ts
export interface FilterRule {
  id: string;
  name: string;
  description: string;
  priority: number;
  active: boolean;
  criteria: {
    from?: string[];
    fromDomain?: string[];
    to?: string[];
    subject?: string[];
    bodyKeywords?: string[];
    hasAttachment?: boolean;
    excludeKeywords?: string[];
  };
  actions: {
    label: string;
    priority?: 1 | 2 | 3 | 4;
    skipAI?: boolean;
  };
  stats: {
    matched: number;
    lastMatched?: Date;
    created: Date;
    accuracy?: number;
  };
}

export interface RuleMatchResult {
  matched: boolean;
  rule?: FilterRule;
  confidence: number;
  matchedCriteria: string[];
}

// Global rule engine state (functional approach)
let rules: FilterRule[] = [];
let isInitialized = false;

// Initialize rule engine 
export const initializeRuleEngine = async (): Promise<void> => {
  if (isInitialized) return;
  
  console.log('🔧 Initializing Rule Engine...');
  
  // Load default rules (matching original loadDefaultRules)
  loadDefaultRules();
  
  // TODO: Load user custom rules from storage/config
  
  isInitialized = true;
  console.log(`✅ Rule Engine initialized with ${rules.length} rules`);
};

// Load default rules (matching original exactly)
const loadDefaultRules = (): void => {
  rules = [
    // High Priority/Boss Rules
    {
      id: 'boss-urgent',
      name: 'Boss Urgent Emails',
      description: 'Emails from management with urgent keywords',
      priority: 10,
      active: true,
      criteria: {
        from: ['nishantattrey07@gmail.com'], // User should customize this
        bodyKeywords: ['urgent', 'asap', 'immediately', 'deadline', 'by today', 'by tomorrow'],
      },
      actions: {
        label: 'TodoAgent_Important',
        priority: 4,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },
    
    // Meeting Rules
    {
      id: 'meeting-invites',
      name: 'Meeting Invitations',
      description: 'Calendar invites and meeting-related emails',
      priority: 9,
      active: true,
      criteria: {
        subject: ['meeting', 'call', 'zoom', 'teams', 'conference'],
        bodyKeywords: ['calendar', 'appointment', 'schedule', 'invited you to', 'join the meeting']
      },
      actions: {
        label: 'TodoAgent_Meeting',
        priority: 3,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    {
      id: 'temporal-urgency',
      name: 'Time-Sensitive Emails',
      description: 'Emails with temporal urgency indicators',
      priority: 8,
      active: true,
      criteria: {
        bodyKeywords: [
          'by end of day', 'by eod', 'by tomorrow', 'by today', 
          'this week', 'next week', 'deadline', 'due date',
          'time sensitive', 'urgent response needed'
        ]
      },
      actions: {
        label: 'TodoAgent_Urgent',
        priority: 4,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    // Task Rules
    {
      id: 'action-verbs',
      name: 'Actionable Requests',
      description: 'Emails with clear action verbs',
      priority: 7,
      active: true,
      criteria: {
        bodyKeywords: [
          'please review', 'please approve', 'please sign', 'please check',
          'can you', 'could you', 'would you mind', 'need you to',
          'action required', 'your input needed', 'waiting for your'
        ]
      },
      actions: {
        label: 'TodoAgent_Task',
        priority: 2,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    // VIP Senders
    {
      id: 'vip-senders',
      name: 'VIP Sender Emails',
      description: 'Important people who always send actionable emails',
      priority: 8,
      active: true,
      criteria: {
        from: [
          // User should customize these
          'nishantattrey07@gmail.com',
        ]
      },
      actions: {
        label: 'TodoAgent_Important',
        priority: 3,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    // Skip Rules (Newsletters, Automated) - HIGH PRIORITY to catch before other rules
    {
      id: 'newsletters-skip',
      name: 'Newsletter and Marketing',
      description: 'Skip automated marketing emails and newsletters',
      priority: 10, // Higher than meeting rules
      active: true,
      criteria: {
        from: ['noreply@', 'no-reply@', 'marketing@', 'newsletter@', 'notifications@'],
        bodyKeywords: ['unsubscribe', 'marketing', 'promotional', 'advertisement', 'daily digest', 'weekly digest'],
        subject: ['newsletter', 'promotion', 'sale', 'offer', 'digest', 'tips', 'update']
      },
      actions: {
        label: 'TodoAgent_Skip',
        skipAI: true,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    {
      id: 'productivity-app-notifications',
      name: 'Productivity App Notifications',
      description: 'Skip notifications from productivity and task management apps',
      priority: 10, // High priority
      active: true,
      criteria: {
        fromDomain: ['todoist.com', 'notion.so', 'slack.com', 'asana.com', 'trello.com', 'monday.com'],
        from: ['no-reply@todoist.com', 'noreply@todoist.com'],
        bodyKeywords: ['daily digest', 'weekly digest', 'task summary', 'productivity tip', 'your tasks for', 'unsubscribe'],
        subject: ['digest', 'summary', 'tip', 'reminder', 'your tasks', 'daily', 'weekly']
      },
      actions: {
        label: 'TodoAgent_Skip',
        skipAI: true,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    {
      id: 'automated-notifications',
      name: 'Automated System Notifications',
      description: 'Skip system notifications and automated emails',
      priority: 9, // Lower than productivity apps
      active: true,
      criteria: {
        from: ['notifications@', 'alerts@', 'system@', 'support@'],
        subject: ['notification', 'alert', 'reminder', 'system update']
      },
      actions: {
        label: 'TodoAgent_Skip',
        skipAI: true,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    {
      id: 'security-login-notifications',
      name: 'Security and Login Notifications',
      description: 'Skip login alerts, security notifications, and account notifications',
      priority: 10, // High priority to catch before other rules
      active: true,
      criteria: {
        subject: ['new login', 'login detected', 'sign in', 'security alert', 'password changed', 'account access'],
        bodyKeywords: [
          'new login to your', 'login detected', 'sign in', 'security alert', 
          'password changed', 'account access', 'noticed a new login',
          'login to your account', 'signed in to', 'accessed your account',
          'login notification', 'security notification', 'account activity'
        ]
      },
      actions: {
        label: 'TodoAgent_Skip',
        skipAI: true,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    },

    // Social Media
    {
      id: 'social-media-skip',
      name: 'Social Media Notifications',
      description: 'Skip social media notifications',
      priority: 6,
      active: true,
      criteria: {
        fromDomain: [
          'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com',
          'pinterest.com', 'youtube.com', 'tiktok.com'
        ],
        subject: ['notification', 'mentioned you', 'tagged you', 'liked your']
      },
      actions: {
        label: 'TodoAgent_Skip',
        skipAI: true,
      },
      stats: {
        matched: 0,
        created: new Date()
      }
    }
  ];
};

// Main email processing function (matching original processEmail)
export const processEmailWithRules = async (email: EmailData): Promise<RuleMatchResult> => {
  if (!isInitialized) {
    await initializeRuleEngine();
  }

  // Sort rules by priority (higher first)
  const sortedRules = rules
    .filter(rule => rule.active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    const matchResult = evaluateRule(email, rule);
    
    if (matchResult.matched) {
      // Update rule stats 
      rule.stats.matched++;
      rule.stats.lastMatched = new Date();
      
      // Apply the rule's action 
      if (rule.actions.label) {
        await addLabelToEmail(email.id, rule.actions.label);
        // Rule match success is logged in the main processing flow
      }
      
      return matchResult;
    }
  }

  // No rules matched 
  return {
    matched: false,
    confidence: 0,
    matchedCriteria: []
  };
};

// Evaluate single rule (matching original evaluateRule exactly)
const evaluateRule = (email: EmailData, rule: FilterRule): RuleMatchResult => {
  const matchedCriteria: string[] = [];
  let totalCriteria = 0;
  let matchedCount = 0;

  // Check From criteria
  if (rule.criteria.from && rule.criteria.from.length > 0) {
    totalCriteria++;
    if (rule.criteria.from.some(sender => 
      email.from.toLowerCase().includes(sender.toLowerCase())
    )) {
      matchedCriteria.push('from');
      matchedCount++;
    }
  }

  // Check FromDomain criteria
  if (rule.criteria.fromDomain && rule.criteria.fromDomain.length > 0) {
    totalCriteria++;
    const emailDomain = extractDomain(email.from);
    if (rule.criteria.fromDomain.some(domain => 
      emailDomain.includes(domain.toLowerCase())
    )) {
      matchedCriteria.push('fromDomain');
      matchedCount++;
    }
  }

  // Check Subject criteria
  if (rule.criteria.subject && rule.criteria.subject.length > 0) {
    totalCriteria++;
    if (rule.criteria.subject.some(keyword => 
      email.subject.toLowerCase().includes(keyword.toLowerCase())
    )) {
      matchedCriteria.push('subject');
      matchedCount++;
    }
  }

  // Check Body keywords
  if (rule.criteria.bodyKeywords && rule.criteria.bodyKeywords.length > 0) {
    totalCriteria++;
    const bodyLower = email.body.toLowerCase();
    const snippetLower = email.snippet.toLowerCase();
    
    if (rule.criteria.bodyKeywords.some(keyword => 
      bodyLower.includes(keyword.toLowerCase()) || 
      snippetLower.includes(keyword.toLowerCase())
    )) {
      matchedCriteria.push('bodyKeywords');
      matchedCount++;
    }
  }

  // Check exclude keywords (if present, email should NOT match)
  if (rule.criteria.excludeKeywords && rule.criteria.excludeKeywords.length > 0) {
    const bodyLower = email.body.toLowerCase();
    const snippetLower = email.snippet.toLowerCase();
    const subjectLower = email.subject.toLowerCase();
    
    const hasExcludeKeyword = rule.criteria.excludeKeywords.some(keyword => 
      bodyLower.includes(keyword.toLowerCase()) || 
      snippetLower.includes(keyword.toLowerCase()) ||
      subjectLower.includes(keyword.toLowerCase())
    );
    
    if (hasExcludeKeyword) {
      return {
        matched: false,
        confidence: 0,
        matchedCriteria: []
      };
    }
  }

  // Calculate confidence based on matched criteria ratio 
  const confidence = totalCriteria > 0 ? matchedCount / totalCriteria : 0;
  
  // Rule matches if confidence is above threshold 
  const matched = confidence >= 0.5 && matchedCount > 0; // At least 50% criteria matched

  return {
    matched,
    rule: matched ? rule : undefined,
    confidence,
    matchedCriteria
  };
};

// Extract domain from email 
const extractDomain = (email: string): string => {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : '';
};

// Rule management functions (matching original API)
export const addCustomRule = async (rule: Omit<FilterRule, 'id' | 'stats'>): Promise<string> => {
  const newRule: FilterRule = {
    ...rule,
    id: `custom-${Date.now()}`,
    stats: {
      matched: 0,
      created: new Date()
    }
  };
  
  rules.push(newRule);
  console.log(`✅ Added custom rule: ${newRule.name}`);
  
  // TODO: Persist to storage
  
  return newRule.id;
};

export const updateRule = async (ruleId: string, updates: Partial<FilterRule>): Promise<boolean> => {
  const ruleIndex = rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) {
    return false;
  }
  
  rules[ruleIndex] = { ...rules[ruleIndex], ...updates };
  console.log(`✅ Updated rule: ${ruleId}`);
  
  // TODO: Persist to storage
  
  return true;
};

export const deleteRule = async (ruleId: string): Promise<boolean> => {
  const ruleIndex = rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) {
    return false;
  }
  
  rules.splice(ruleIndex, 1);
  console.log(`✅ Deleted rule: ${ruleId}`);
  
  // TODO: Remove from storage
  
  return true;
};

export const getRules = (): FilterRule[] => {
  return [...rules];
};

export const getRule = (ruleId: string): FilterRule | undefined => {
  return rules.find(r => r.id === ruleId);
};

export const getRuleStats = (): { [ruleName: string]: number } => {
  const stats: { [ruleName: string]: number } = {};
  rules.forEach(rule => {
    stats[rule.name] = rule.stats.matched;
  });
  return stats;
};

// Helper method to suggest new rules based on patterns 
export const suggestRuleFromPattern = async (
  pattern: { from?: string; keywords?: string[]; label: string },
  sampleCount: number = 3
): Promise<FilterRule> => {
  const ruleId = `suggested-${Date.now()}`;
  
  return {
    id: ruleId,
    name: `Auto-suggested: ${pattern.from || pattern.keywords?.join(', ')}`,
    description: `Suggested rule based on ${sampleCount} similar classifications`,
    priority: 5,
    active: false, // Start inactive for user review
    criteria: {
      from: pattern.from ? [pattern.from] : undefined,
      bodyKeywords: pattern.keywords || undefined
    },
    actions: {
      label: pattern.label,
      priority: 2
    },
    stats: {
      matched: 0,
      created: new Date(),
      accuracy: 0.8 // Estimated accuracy
    }
  };
};