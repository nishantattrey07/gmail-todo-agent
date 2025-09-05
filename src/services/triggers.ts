// Gmail triggers service - pure functions following docs
import { createTrigger, getActiveGmailAccount, getComposio } from './composio';

// Create Gmail new message trigger (following docs pattern)
export const createGmailTrigger = async (webhookUrl: string): Promise<{success: boolean, triggerId?: string, error?: string}> => {
  try {
    const gmailAccount = await getActiveGmailAccount();
    
    if (!gmailAccount) {
      return { success: false, error: 'No active Gmail account found' };
    }

    console.log(`📡 Creating Gmail trigger with webhook: ${webhookUrl}`);

    // Using the createTrigger function from composio service
    const trigger = await createTrigger(
      'GMAIL_NEW_GMAIL_MESSAGE',
      {
        webhookUrl: webhookUrl
      },
      gmailAccount.id
    );

    if (trigger.triggerId) {
      console.log(`✅ Gmail trigger created: ${trigger.triggerId}`);
      return { success: true, triggerId: trigger.triggerId };
    } else {
      return { success: false, error: 'No trigger ID returned' };
    }

  } catch (error) {
    console.error('❌ Failed to create Gmail trigger:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// List active triggers (simplified for now - trigger listing is complex in new SDK)
export const listActiveTriggers = async (): Promise<Array<{id: string, slug: string, status: string}>> => {
  try {
    // For now, return empty array since trigger listing is mainly for monitoring
    // The actual trigger functionality works through the create/delete functions
    console.log('📋 Trigger listing not implemented in current SDK version');
    return [];

  } catch (error) {
    console.error('❌ Failed to list triggers:', error);
    return [];
  }
};

// Delete trigger (using Composio SDK instead of direct API calls)
export const deleteTrigger = async (triggerId: string): Promise<boolean> => {
  try {
    const composio = getComposio();
    
    // Use SDK method instead of direct API call
    await composio.triggers.delete(triggerId);

    console.log(`🗑️ Trigger deleted: ${triggerId}`);
    return true;

  } catch (error) {
    console.error(`❌ Failed to delete trigger ${triggerId}:`, error);
    return false;
  }
};

// Check if Gmail trigger exists
export const hasGmailTrigger = async (): Promise<boolean> => {
  const triggers = await listActiveTriggers();
  return triggers.some(t => t.slug === 'GMAIL_NEW_GMAIL_MESSAGE' && t.status === 'active');
};