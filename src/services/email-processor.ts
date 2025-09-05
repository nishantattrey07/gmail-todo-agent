// Phase 3: Enhanced email processor with AI and rules - functional approach
import { EmailData, ProcessingResult } from '../core/types';
import { getEmails, getEmailById, addLabelToEmail, hasLabel, EmailQuery, markEmailProcessed } from './gmail';
import { createTaskFromEmail } from './todoist';
import { classifyEmail, initializeAI } from './ai-service';
import { processEmailWithRules, initializeRuleEngine } from './rule-engine';

// Enhanced processing stats (matching original)
export interface ProcessingStats {
  totalProcessed: number;
  ruleMatched: number;
  aiProcessed: number;
  tasksCreated: number;
  skipped: number;
  failed: number;
  processingTime: number;
}

export interface ProcessingContext {
  emailId: string;
  source: 'webhook' | 'batch' | 'manual';
  timestamp: Date;
  ruleMatched?: boolean;
  aiClassified?: boolean;
  taskCreated?: boolean;
}

// Global processing state (functional approach)
let isProcessorInitialized = false;
let processingStats: ProcessingStats = {
  totalProcessed: 0,
  ruleMatched: 0,
  aiProcessed: 0,
  tasksCreated: 0,
  skipped: 0,
  failed: 0,
  processingTime: 0
};

// Initialize email processor
export const initializeEmailProcessor = async (): Promise<void> => {
  if (isProcessorInitialized) return;
  
  console.log('🔄 Initializing Email Processor...');
  
  // Initialize all services
  await initializeRuleEngine();
  
  isProcessorInitialized = true;
  console.log('✅ Email Processor initialized successfully');
};

// Enhanced process single email
export const processEmail = async (
  emailId: string, 
  context: ProcessingContext = {
    emailId,
    source: 'manual',
    timestamp: new Date()
  }
): Promise<ProcessingResult> => {
  if (!isProcessorInitialized) {
    await initializeEmailProcessor();
  }

  const startTime = Date.now();
  
  try {
    console.log(`Processing email: ${emailId}`);
    processingStats.totalProcessed++;
    
    // Get email data
    const email = await getEmailById(emailId);
    if (!email) {
      return {
        success: false,
        emailId,
        error: 'Email not found',
        timestamp: new Date().toISOString()
      };
    }

    // Step 1: Check if already successfully processed
    if (hasProcessedLabel(email)) {
      processingStats.skipped++;
      console.log(` Email ${emailId} already processed, skipping`);
      return {
        success: true,
        emailId,
        error: 'Already processed',
        timestamp: new Date().toISOString()
      };
    }

    // Step 1.5: Handle retry for failed emails
    if (hasLabel(email, 'TodoAgent_Failed')) {
      console.log(`🔄 Retrying previously failed email ${emailId}`);
      // Note: The failed label will be replaced with success/failed based on this attempt
    }

    // Step 2: Check if email should be skipped 
    if (hasLabel(email, 'TodoAgent_Skip')) {
      processingStats.skipped++;
      return {
        success: true,
        emailId,
        error: 'Marked to skip',
        timestamp: new Date().toISOString()
      };
    }

    // Step 3: Check if email already has action labels (from previous rule processing)
    if (hasActionLabel(email)) {
      context.ruleMatched = true;
      processingStats.ruleMatched++;
      return await processLabeledEmail(email, context);
    }

    // Step 4: Apply rules to unlabeled email (matching original)
    const ruleResult = await processEmailWithRules(email);
    
    if (ruleResult.matched && ruleResult.rule) {
      context.ruleMatched = true;
      processingStats.ruleMatched++;
      
      // If rule applied a label, get updated email and process
      const updatedEmail = await getEmailById(email.id);
      if (updatedEmail && hasActionLabel(updatedEmail)) {
        return await processLabeledEmail(updatedEmail, context);
      }
      
      // If rule marked to skip AI, mark as processed
      if (ruleResult.rule.actions.skipAI) {
        await markEmailProcessed(email.id, 'skipped');
        processingStats.skipped++;
        return {
          success: true,
          emailId,
          error: 'Rule marked to skip',
          timestamp: new Date().toISOString()
        };
      }
    }

    // Step 5: No rules matched - use AI classification (if available)
    return await processWithAI(email, context);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error processing email ${emailId}:`, error);
    processingStats.failed++;
    
    // Add failed label
    try {
      await markEmailProcessed(emailId, 'failed');
    } catch (labelError) {
      console.error('❌ Could not add failed label:', labelError);
    }
    
    return {
      success: false,
      emailId,
      error: errorMsg,
      timestamp: new Date().toISOString()
    };
  } finally {
    const processingTime = Date.now() - startTime;
    processingStats.processingTime += processingTime;
  }
};

// Process multiple emails
export const processEmails = async (queryParams: EmailQuery = {}): Promise<ProcessingResult[]> => {
  const { query = 'is:unread', maxResults = 10 } = queryParams;
  
  try {
    console.log(`📧 Processing emails with query: "${query}" (max: ${maxResults})`);
    
    // Get emails from Gmail
    const emails = await getEmails(queryParams);
    
    if (emails.length === 0) {
      console.log('📧 No emails to process');
      return [];
    }

    console.log(`📧 Found ${emails.length} emails to process`);
    
    // Process emails one by one (sequential to avoid rate limits)
    const results: ProcessingResult[] = [];
    
    for (const email of emails) {
      const result = await processEmail(email.id);
      results.push(result);
      
      // Small delay to avoid rate limiting
      await delay(1000);
    }

    // Log summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const tasksCreated = results.filter(r => r.taskId).length;
    
    console.log(`📊 Processing complete: ${successful} successful, ${failed} failed, ${tasksCreated} tasks created`);
    
    return results;

  } catch (error) {
    console.error('❌ Error processing emails:', error);
    throw error;
  }
};

// Process email that already has action labels (matching original processLabeledEmail)
const processLabeledEmail = async (
  email: EmailData, 
  context: ProcessingContext
): Promise<ProcessingResult> => {
  try {
    // Extract task data from labeled email (matching original)
    const taskData = extractTaskDataFromLabeledEmail(email);
    
    // Create Todoist task
    const taskResult = await createTaskFromEmail(email);
    
    if (taskResult.success) {
      // Mark email as successfully processed
      await markEmailProcessed(email.id, 'success');
      processingStats.tasksCreated++;
      
      console.log(`✅ Task created from labeled email ${email.id}: ${taskResult.taskId}`);
      
      return {
        success: true,
        emailId: email.id,
        taskId: taskResult.taskId,
        timestamp: new Date().toISOString()
      };
    } else {
      // Mark as failed
      await markEmailProcessed(email.id, 'failed');
      console.error(`❌ Task creation failed for email ${email.id}: ${taskResult.error}`);
      
      return {
        success: false,
        emailId: email.id,
        error: taskResult.error,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    await markEmailProcessed(email.id, 'failed');
    throw error;
  }
};

// Process email using AI classification (matching original processWithAI)
const processWithAI = async (
  email: EmailData, 
  context: ProcessingContext
): Promise<ProcessingResult> => {
  context.aiClassified = true;
  processingStats.aiProcessed++;
  
  try {
    // Check if AI is available
    if (!process.env.OPENAI_API_KEY) {
      console.log(`⚠️ No OpenAI API key - falling back to basic classification for ${email.id}`);
      return await processWithBasicClassification(email);
    }

    // Initialize AI service if needed
    await initializeAI();
    
    // Classify email with AI
    const aiResult = await classifyEmail(email);
    
    console.log(`🤖 AI classification for ${email.id}: ${aiResult.isActionable ? 'actionable' : 'not actionable'} (confidence: ${aiResult.confidence})`);
    
    if (aiResult.isActionable && aiResult.taskData) {
      // Apply the suggested label
      await addLabelToEmail(email.id, aiResult.suggestedLabel);
      
      // Create Todoist task using AI-generated task data
      const taskResult = await createTaskFromEmail(email);
      
      if (taskResult.success) {
        await markEmailProcessed(email.id, 'success');
        processingStats.tasksCreated++;
        
        console.log(`✅ AI-processed email ${email.id} created task: ${taskResult.taskId}`);
        
        return {
          success: true,
          emailId: email.id,
          taskId: taskResult.taskId,
          timestamp: new Date().toISOString()
        };
      } else {
        await markEmailProcessed(email.id, 'failed');
        
        return {
          success: false,
          emailId: email.id,
          error: taskResult.error,
          timestamp: new Date().toISOString()
        };
      }
    } else {
      // Not actionable - mark as skip
      await addLabelToEmail(email.id, 'TodoAgent_Skip');
      await markEmailProcessed(email.id, 'skipped');
      processingStats.skipped++;
      
      console.log(`⏭️ AI determined email ${email.id} is not actionable`);
      
      return {
        success: true,
        emailId: email.id,
        error: 'AI determined not actionable',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error(`❌ AI processing failed for ${email.id}, falling back to basic classification:`, error);
    return await processWithBasicClassification(email);
  }
};

// Fallback basic classification
const processWithBasicClassification = async (email: EmailData): Promise<ProcessingResult> => {
  try {
    // Use the original simple logic from Phase 2
    if (shouldSkipEmail(email)) {
      await addLabelToEmail(email.id, 'TodoAgent_Skip');
      await markEmailProcessed(email.id, 'skipped');
      processingStats.skipped++;
      return {
        success: true,
        emailId: email.id,
        error: 'Basic classification - skipped',
        timestamp: new Date().toISOString()
      };
    }

    // Default to creating task
    const taskResult = await createTaskFromEmail(email);
    
    if (taskResult.success) {
      await addLabelToEmail(email.id, 'TodoAgent_Task');
      await markEmailProcessed(email.id, 'success');
      processingStats.tasksCreated++;
      
      return {
        success: true,
        emailId: email.id,
        taskId: taskResult.taskId,
        timestamp: new Date().toISOString()
      };
    } else {
      await markEmailProcessed(email.id, 'failed');
      return {
        success: false,
        emailId: email.id,
        error: taskResult.error,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    await markEmailProcessed(email.id, 'failed');
    throw error;
  }
};

// Extract task data from emails that already have action labels (matching original)
const extractTaskDataFromLabeledEmail = (email: EmailData): {
  title: string;
  description: string;
  dueString?: string;
  priority: 1 | 2 | 3 | 4;
  category: string;
} => {
  const senderName = email.from.split('<')[0].trim() || email.from;
  const cleanSubject = email.subject.replace(/^(re:|fwd?:)\s*/i, '').trim();
  
  // Determine priority and category based on labels
  let priority: 1 | 2 | 3 | 4 = 2;
  let category = 'task';
  
  if (hasLabel(email, 'TodoAgent_Important')) {
    priority = 4;
    category = 'urgent';
  } else if (hasLabel(email, 'TodoAgent_Urgent')) {
    priority = 4;
    category = 'urgent';
  } else if (hasLabel(email, 'TodoAgent_Meeting')) {
    priority = 3;
    category = 'meeting';
  } else if (hasLabel(email, 'TodoAgent_Task')) {
    priority = 2;
    category = 'task';
  }
  
  return {
    title: cleanSubject.length > 0 
      ? `${cleanSubject} (from ${senderName})`
      : `Email from ${senderName}`,
    description: `${email.snippet}\n\nFrom: ${email.from}\nReceived: ${email.timestamp}`,
    priority,
    category
  };
};

// Helper function: check if email has processed label (using proper hasLabel function)
const hasProcessedLabel = (email: EmailData): boolean => {
  return hasLabel(email, 'TodoAgent_Processed') || 
         hasLabel(email, 'TodoAgent_Skip');
  // Note: TodoAgent_Failed is NOT included here so failed emails can be retried
};

// Helper function: check if email has action labels (matching original hasActionLabel)
const hasActionLabel = (email: EmailData): boolean => {
  const actionLabels = ['TodoAgent_Important', 'TodoAgent_Urgent', 'TodoAgent_Meeting', 'TodoAgent_Task'];
  return actionLabels.some(label => hasLabel(email, label));
};

// Helper function: determine if email should be skipped (basic classification)
const shouldSkipEmail = (email: EmailData): boolean => {
  const skipKeywords = [
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'newsletter', 'unsubscribe', 'marketing',
    'automated', 'system', 'notification',
    'github.com', 'linkedin.com', 'facebook.com'
  ];
  
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();
  
  return skipKeywords.some(keyword => 
    fromLower.includes(keyword) || subjectLower.includes(keyword)
  );
};

// Get processing statistics
export const getProcessingStats = (): ProcessingStats => {
  return { ...processingStats };
};

// Reset processing statistics
export const resetProcessingStats = (): void => {
  processingStats = {
    totalProcessed: 0,
    ruleMatched: 0,
    aiProcessed: 0,
    tasksCreated: 0,
    skipped: 0,
    failed: 0,
    processingTime: 0
  };
  console.log('📊 Processing statistics reset');
};

// Helper function: simple delay
const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));