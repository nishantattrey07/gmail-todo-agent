// Simple Gmail service using Composio actions (following original patterns and docs)
import { executeAction, getActiveGmailAccount } from './composio';
import { EmailData } from '../core/types';

export interface EmailQuery {
  query?: string;
  maxResults?: number;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

// Get Gmail emails using GMAIL_FETCH_EMAILS action
export const getEmails = async (queryParams: EmailQuery = {}): Promise<EmailData[]> => {
  const { query = 'is:unread', maxResults = 50, labelIds, includeSpamTrash = false } = queryParams;
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    console.log(`📧 Fetching emails with query: ${query}`);
    const result = await executeAction('GMAIL_FETCH_EMAILS', {
      connectedAccountId: gmailAccount.id,
      arguments: {
        query: query,
        max_results: maxResults,
        label_ids: labelIds,
        include_spam_trash: includeSpamTrash,
        verbose: true
      }
    });

    // Match original result structure check
    if (!result.successful || !result.data?.messages) {
      console.log('📧 No emails found');
      return [];
    }

    console.log(`📧 Found ${result.data.messages.length} emails`);
    
    // Transform Gmail API response to our EmailData format (matching original parseEmailData)
    return result.data.messages.map((message: any) => {
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => 
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      
      const body = message.messageText || '';
      const snippet = body.substring(0, 150).replace(/[\r\n]/g, ' ').trim();
      
      return {
        id: message.messageId || message.id,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        body: body.substring(0, 5000),
        snippet: snippet,
        labelIds: message.labelIds || [],
        threadId: message.messageId || message.threadId,
        timestamp: new Date(message.messageTimestamp || Date.now())
      };
    });

  } catch (error) {
    console.error('❌ Failed to fetch emails:', error);
    throw error;
  }
};

// Get specific email by ID
export const getEmailById = async (emailId: string): Promise<EmailData | null> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    const result = await executeAction('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
      connectedAccountId: gmailAccount.id,
      arguments: {
        message_id: emailId,
        format: 'full'
      }
    });

    if (!result.successful || !result.data) {
      return null;
    }

    // Use same parsing logic as getEmails
    const message = result.data;
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    const body = message.messageText || '';
    const snippet = body.substring(0, 150).replace(/[\r\n]/g, ' ').trim();
    
    return {
      id: message.messageId || message.id,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      body: body.substring(0, 5000),
      snippet: snippet,
      labelIds: message.labelIds || [],
      threadId: message.messageId || message.threadId,
      timestamp: new Date(message.messageTimestamp || Date.now())
    };

  } catch (error) {
    console.error(`❌ Failed to fetch email ${emailId}:`, error);
    return null;
  }
};

// Add label to email (matching original applyLabel logic)
export const addLabelToEmail = async (emailId: string, labelName: string): Promise<boolean> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    // First get label ID by name (matching original getLabelId logic)
    const labelId = await getLabelId(labelName);
    if (!labelId) {
      console.error(`❌ Label not found: ${labelName}`);
      return false;
    }

    console.log(`🏷️ Adding label "${labelName}" to email ${emailId}`);
    
    const result = await executeAction('GMAIL_ADD_LABEL_TO_EMAIL', {
      connectedAccountId: gmailAccount.id,
      arguments: {
        message_id: emailId,
        add_label_ids: [labelId]
      }
    });

    if (result.successful) {
      console.log(`✅ Label "${labelName}" added to email ${emailId}`);
      return true;
    } else {
      console.error(`❌ Failed to apply label ${labelName}:`, result.error);
      return false;
    }

  } catch (error) {
    console.error(`❌ Failed to add label to email ${emailId}:`, error);
    return false;
  }
};

// Label cache for performance (matching original)
let labelCache = new Map<string, {id: string, name: string, type: string}>();

// Get label ID by name (matching original getLabelId)
export const getLabelId = async (labelName: string): Promise<string | null> => {
  // Try cache first
  const cached = labelCache.get(labelName);
  if (cached) {
    return cached.id;
  }
  
  // Refresh cache and try again
  await refreshLabelCache();
  const refreshed = labelCache.get(labelName);
  return refreshed?.id || null;
};

// Refresh label cache (matching original)
const refreshLabelCache = async (): Promise<void> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    const result = await executeAction('GMAIL_LIST_LABELS', {
      connectedAccountId: gmailAccount.id,
      arguments: { user_id: 'me' }
    });
    
    if (result.successful && result.data.labels) {
      labelCache.clear();
      result.data.labels.forEach((label: any) => {
        labelCache.set(label.name, {
          id: label.id,
          name: label.name,
          type: label.type || 'user'
        });
      });
    }
  } catch (error) {
    console.error('❌ Failed to refresh label cache:', error);
  }
};

// List Gmail labels
export const listLabels = async (): Promise<Array<{id: string, name: string}>> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    await refreshLabelCache();
    return Array.from(labelCache.values()).map(label => ({
      id: label.id,
      name: label.name
    }));

  } catch (error) {
    console.error('❌ Failed to list labels:', error);
    return [];
  }
};

// Create Gmail label (matching original logic)
export const createLabel = async (labelName: string): Promise<string | null> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    console.log(`🏷️ Creating label: ${labelName}`);
    
    const result = await executeAction('GMAIL_CREATE_LABEL', {
      connectedAccountId: gmailAccount.id,
      arguments: {
        label_name: labelName
      }
    });

    if (result.successful && result.data && result.data.id) {
      console.log(`✅ Label "${labelName}" created with ID: ${result.data.id}`);
      // Update cache
      labelCache.set(labelName, {
        id: result.data.id,
        name: labelName,
        type: 'user'
      });
      return result.data.id;
    } else {
      console.error(`❌ Failed to create label ${labelName}: API call failed`, result.error || result);
      return null;
    }

  } catch (error) {
    console.error(`❌ Failed to create label "${labelName}":`, error);
    return null;
  }
};

// Check if email has specific labels (matching original hasActionLabel logic)
export const hasLabel = (email: EmailData, labelName: string): boolean => {
  return email.labelIds.some(labelId => {
    const label = Array.from(labelCache.values()).find(l => l.id === labelId);
    return label && label.name === labelName;
  });
};

// Additional helper functions matching original patterns
export const findUnlabeledEmails = async (systemLabelNames: string[]): Promise<EmailData[]> => {
  const excludeLabels = systemLabelNames.map(name => `-label:"${name}"`).join(' ');
  const query = `${excludeLabels} newer_than:1d`;
  
  return await getEmails({
    query,
    maxResults: 100
  });
};

export const markEmailProcessed = async (emailId: string, status: 'success' | 'failed' | 'skipped'): Promise<boolean> => {
  const labelName = status === 'success' ? 'TodoAgent_Processed' : 
                   status === 'failed' ? 'TodoAgent_Failed' : 'TodoAgent_Skip';
  
  // If marking as successful, remove any previous failed labels first
  if (status === 'success') {
    console.log(`✅ Email ${emailId} succeeded - cleaning up any previous failure labels`);
    // Skip cleanup for now due to API limitations - the failed label will be overridden by success label
    // await removeLabelFromEmail(emailId, 'TodoAgent_Failed');
  }
  
  return await addLabelToEmail(emailId, labelName);
};

// Remove label from email
export const removeLabelFromEmail = async (emailId: string, labelName: string): Promise<boolean> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account found');
    }

    // Get label ID by name
    const labelId = await getLabelId(labelName);
    if (!labelId) {
      console.warn(`⚠️ Label not found: ${labelName}`);
      return false;
    }

    console.log(`🗑️ Removing label "${labelName}" from email ${emailId}`);
    
    // Use the remove label action (since GMAIL_MODIFY_LABELS doesn't exist)
    const result = await executeAction('GMAIL_REMOVE_LABEL_FROM_EMAIL', {
      connectedAccountId: gmailAccount.id,
      arguments: {
        message_id: emailId,
        label_id: labelId
      }
    });

    if (result.error) {
      console.error(`❌ Failed to remove label ${labelName}:`, result.error);
      return false;
    }

    console.log(`✅ Label "${labelName}" removed from email ${emailId}`);
    return true;

  } catch (error) {
    console.error(`❌ Failed to remove label from email ${emailId}:`, error);
    return false;
  }
};