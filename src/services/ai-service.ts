// Phase 3: AI Classification Service - functional approach following gmail-todo-agent logic
import { EmailData } from '../core/types';

// Types matching original ai-service.ts
export interface AIClassificationResult {
  isActionable: boolean;
  suggestedLabel: string;
  confidence: number;
  taskData?: {
    title: string;
    description: string;
    dueString?: string;
    priority: 1 | 2 | 3 | 4;
    category: 'task' | 'meeting' | 'review' | 'urgent' | 'information';
  };
  keywords: string[];
  reasoning: string;
  temporalIndicators?: {
    hasDeadline: boolean;
    urgencyLevel: 'low' | 'medium' | 'high';
    timeframe?: string;
  };
}

export interface LearningData {
  emailId: string;
  from: string;
  subject: string;
  classification: string;
  confidence: number;
  keywords: string[];
  timestamp: Date;
}

// Global AI service state (functional approach)
let isInitialized = false;
let classificationHistory: LearningData[] = [];
let openaiApiKey = '';
let modelName = 'gpt-4o-mini';

// Initialize AI service
export const initializeAI = async (apiKey?: string, model?: string): Promise<{success: boolean, error?: string}> => {
  if (isInitialized) {
    return { success: true }; // Already initialized
  }

  try {
    openaiApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (model) modelName = model;
    
    if (!openaiApiKey) {
      return { success: false, error: 'No OpenAI API key provided' };
    }

    // Test connection by making a simple API call
    const testResponse = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!testResponse.ok) {
      return { success: false, error: `OpenAI API test failed: ${testResponse.statusText}` };
    }

    isInitialized = true;
    console.log(`✅ AI Service initialized with model: ${modelName}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to initialize AI Service:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Check if AI service is available and ready
export const isAIAvailable = (): boolean => {
  return isInitialized;
};

// Main classification function (matching original classifyEmail)
export const classifyEmail = async (email: EmailData): Promise<AIClassificationResult> => {
  if (!isInitialized) {
    throw new Error('AI service not initialized. Call initializeAI() first.');
  }

  try {
    const prompt = buildClassificationPrompt(email);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: `You are an expert email classifier for productivity systems. Your job is to analyze emails and determine if they require action from the recipient.

CLASSIFICATION RULES:
1. ACTIONABLE emails require the recipient to DO something (reply, review, approve, attend, complete)
2. NON-ACTIONABLE emails are informational, newsletters, notifications, or automated messages
3. Consider urgency based on temporal language (today, tomorrow, deadline, urgent)
4. Consider sender importance and relationship context

RESPONSE FORMAT: Always return valid JSON with the exact structure requested.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content || '{}');
    
    // Validate and normalize the AI response (matching original)
    const classification = validateAndNormalizeResult(result, email);
    
    // Store for learning (matching original)
    recordClassification(email, classification);
    
    return classification;
    
  } catch (error) {
    console.error(`❌ AI classification failed for email ${email.id}:`, error);
    
    // Fallback classification (matching original)
    return {
      isActionable: false,
      suggestedLabel: 'TodoAgent_Skip',
      confidence: 0.1,
      keywords: [],
      reasoning: 'AI classification failed, marked as non-actionable for safety'
    };
  }
};

// Build classification prompt (matching original buildClassificationPrompt)
const buildClassificationPrompt = (email: EmailData): string => {
  return `
Analyze this email and determine if it requires action from the recipient:

FROM: ${email.from}
TO: ${email.to}
SUBJECT: ${email.subject}
SNIPPET: ${email.snippet}
BODY: ${email.body.substring(0, 2000)}

Return JSON with this exact structure:
{
  "isActionable": boolean,
  "suggestedLabel": "TodoAgent_Important" | "TodoAgent_Urgent" | "TodoAgent_Meeting" | "TodoAgent_Task" | "TodoAgent_Skip",
  "confidence": number between 0 and 1,
  "taskData": {
    "title": "concise actionable task title",
    "description": "what needs to be done",
    "dueString": "natural language due date like 'tomorrow', 'next week', 'by Friday' or null",
    "priority": number 1-4 (4=urgent, 1=low),
    "category": "task" | "meeting" | "review" | "urgent" | "information"
  },
  "keywords": ["key", "words", "that", "indicate", "actionability"],
  "reasoning": "brief explanation of classification decision",
  "temporalIndicators": {
    "hasDeadline": boolean,
    "urgencyLevel": "low" | "medium" | "high",
    "timeframe": "extracted time constraint or null"
  }
}

CLASSIFICATION GUIDELINES:
- TodoAgent_Important: High priority, from important people, urgent content
- TodoAgent_Urgent: Time-sensitive with deadlines (today, tomorrow, this week)
- TodoAgent_Meeting: Meeting invites, calendar events, scheduling
- TodoAgent_Task: General actionable items requiring work
- TodoAgent_Skip: Newsletters, notifications, automated messages, security alerts, login notifications, system emails, non-actionable

SPECIFIC SKIP PATTERNS:
- Login/security: "login", "sign in", "password", "security alert", "account access"
- Notifications: "notification", "alert", "reminder", "update", "confirmation"
- Automated: "noreply", "no-reply", "donotreply", "automated", "system"
- Marketing: "newsletter", "subscribe", "unsubscribe", "promotion"

ACTIONABLE INDICATORS:
- Action verbs: "please review", "can you", "need you to", "action required"
- Questions directed at recipient
- Requests for approval, feedback, or response
- Meeting invitations requiring response
- Deadlines and time-sensitive requests

NON-ACTIONABLE INDICATORS:
- "FYI", "for your information"
- Newsletters, marketing emails
- Automated notifications (login alerts, security notifications, system updates)
- Status updates without required action
- "No reply needed"
- Security notifications ("new login", "password changed", "login detected")
- Account notifications from services (welcome messages, confirmations)
- System-generated emails that are purely informational
`;
};

// Validate and normalize AI response (matching original validateAndNormalizeResult)
const validateAndNormalizeResult = (result: any, email: EmailData): AIClassificationResult => {
  const normalized: AIClassificationResult = {
    isActionable: Boolean(result.isActionable),
    suggestedLabel: validateLabel(result.suggestedLabel),
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
    reasoning: String(result.reasoning || 'No reasoning provided'),
    temporalIndicators: {
      hasDeadline: Boolean(result.temporalIndicators?.hasDeadline),
      urgencyLevel: ['low', 'medium', 'high'].includes(result.temporalIndicators?.urgencyLevel) 
        ? result.temporalIndicators.urgencyLevel 
        : 'low',
      timeframe: result.temporalIndicators?.timeframe || undefined
    }
  };

  // Add task data if actionable (matching original)
  if (normalized.isActionable && result.taskData) {
    normalized.taskData = {
      title: String(result.taskData.title || generateTaskTitle(email)),
      description: String(result.taskData.description || email.snippet),
      dueString: result.taskData.dueString || undefined,
      priority: [1, 2, 3, 4].includes(result.taskData.priority) ? result.taskData.priority : 2,
      category: ['task', 'meeting', 'review', 'urgent', 'information'].includes(result.taskData.category)
        ? result.taskData.category
        : 'task'
    };
  }

  return normalized;
};

// Validate label (matching original)
const validateLabel = (label: string): string => {
  const validLabels = [
    'TodoAgent_Important',
    'TodoAgent_Urgent', 
    'TodoAgent_Meeting',
    'TodoAgent_Task',
    'TodoAgent_Skip'
  ];
  
  return validLabels.includes(label) ? label : 'TodoAgent_Skip';
};

// Generate task title (matching original)
const generateTaskTitle = (email: EmailData): string => {
  const subject = email.subject.replace(/^(re:|fwd?:)\s*/i, '').trim();
  const fromName = email.from.split('<')[0].trim() || email.from;
  
  return subject.length > 0 
    ? `${subject} (from ${fromName})`
    : `Email from ${fromName}`;
};

// Record classification for learning (matching original)
const recordClassification = (email: EmailData, result: AIClassificationResult): void => {
  const learningData: LearningData = {
    emailId: email.id,
    from: email.from,
    subject: email.subject,
    classification: result.suggestedLabel,
    confidence: result.confidence,
    keywords: result.keywords,
    timestamp: new Date()
  };
  
  classificationHistory.push(learningData);
  
  // Keep only last 1000 classifications to prevent memory bloat (matching original)
  if (classificationHistory.length > 1000) {
    classificationHistory = classificationHistory.slice(-1000);
  }
};

// Batch processing for multiple emails (matching original)
export const classifyEmails = async (emails: EmailData[]): Promise<AIClassificationResult[]> => {
  const results: AIClassificationResult[] = [];
  
  // Process in batches to avoid rate limits (matching original)
  const batchSize = 5;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    const batchPromises = batch.map(email => classifyEmail(email));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    // Rate limiting: wait between batches (matching original)
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
};

// Learning and pattern analysis functions (matching original)
export const getClassificationStats = (): { [label: string]: number } => {
  const stats: { [label: string]: number } = {};
  
  classificationHistory.forEach(record => {
    stats[record.classification] = (stats[record.classification] || 0) + 1;
  });
  
  return stats;
};

export const getSenderPatterns = (): { [sender: string]: { label: string; count: number; confidence: number } } => {
  const patterns: { [sender: string]: { labels: string[]; confidences: number[] } } = {};
  
  classificationHistory.forEach(record => {
    const senderDomain = extractDomain(record.from);
    if (!patterns[senderDomain]) {
      patterns[senderDomain] = { labels: [], confidences: [] };
    }
    patterns[senderDomain].labels.push(record.classification);
    patterns[senderDomain].confidences.push(record.confidence);
  });
  
  const result: { [sender: string]: { label: string; count: number; confidence: number } } = {};
  
  Object.entries(patterns).forEach(([sender, data]) => {
    const labelCounts: { [label: string]: number } = {};
    data.labels.forEach(label => {
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });
    
    const mostFrequentLabel = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (mostFrequentLabel && mostFrequentLabel[1] >= 3) { // At least 3 occurrences
      result[sender] = {
        label: mostFrequentLabel[0],
        count: mostFrequentLabel[1],
        confidence: data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length
      };
    }
  });
  
  return result;
};

const extractDomain = (email: string): string => {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : email.toLowerCase();
};

// Get suggested rules based on AI learning (matching original)
export const getSuggestedRules = async (): Promise<Array<{
  type: 'sender' | 'keyword';
  pattern: string;
  suggestedLabel: string;
  confidence: number;
  sampleCount: number;
}>> => {
  const suggestions: Array<{
    type: 'sender' | 'keyword';
    pattern: string;
    suggestedLabel: string;
    confidence: number;
    sampleCount: number;
  }> = [];
  
  // Analyze sender patterns (matching original)
  const senderPatterns = getSenderPatterns();
  Object.entries(senderPatterns).forEach(([sender, data]) => {
    if (data.confidence > 0.8 && data.count >= 5) {
      suggestions.push({
        type: 'sender',
        pattern: sender,
        suggestedLabel: data.label,
        confidence: data.confidence,
        sampleCount: data.count
      });
    }
  });
  
  return suggestions.sort((a, b) => b.confidence - a.confidence);
};

// Clear learning history (matching original)
export const clearHistory = (): void => {
  classificationHistory = [];
  console.log('🧹 AI classification history cleared');
};