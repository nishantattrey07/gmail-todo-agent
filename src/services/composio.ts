import { Composio } from '@composio/core';
import { ConnectedAccount } from '../core/types';


let composioInstance: Composio | null = null;
let isInitialized = false;
let connectedAccountsCache = new Map<string, ConnectedAccount>();


const getConfig = () => ({
  apiKey: process.env.COMPOSIO_API_KEY || '',
  userId: process.env.COMPOSIO_USER_ID || 'default'
});

export const initializeComposio = async (apiKey?: string): Promise<Composio> => {
  try {
    if (apiKey) {
      process.env.COMPOSIO_API_KEY = apiKey;
    }

    const config = getConfig();
    const composio = new Composio({
      apiKey: config.apiKey
    });

    // Test connection by listing accounts
    await composio.connectedAccounts.list({
      userIds: [config.userId]
    });

    composioInstance = composio;
    isInitialized = true;
    console.log('✅ Composio client initialized successfully');
    return composio;
  } catch (error) {
    console.error('❌ Failed to initialize Composio client:', error);
    // Match original error format exactly
    throw new Error(`Composio initialization failed: ${error}`);
  }
};

// Get initialized client
export const getComposio = (): Composio => {
  if (!isInitialized || !composioInstance) {
    throw new Error('Composio client not initialized');
  }
  return composioInstance;
};

// Execute tool action
export const executeAction = async (
  action: string, 
  params: { connectedAccountId: string; arguments: any }
): Promise<any> => {
  // Match original validation pattern
  if (!isInitialized || !composioInstance) {
    throw new Error('Composio client not initialized');
  }
  
  try {
    const config = getConfig();
    const result = await composioInstance.tools.execute(action, {
      userId: config.userId,
      ...params
    });
    return result;
  } catch (error) {
    // Match original error format
    console.error(`Action failed: ${action}`, error);
    throw error;
  }
};

// Create trigger
export const createTrigger = async (
  triggerSlug: string,
  triggerConfig: any = {},
  connectedAccountId?: string
): Promise<any> => {
  if (!isInitialized || !composioInstance) {
    throw new Error('Composio client not initialized');
  }

  try {
    const config = getConfig();
    const requestBody: any = { triggerConfig };
    
    if (connectedAccountId) {
      requestBody.connectedAccountId = connectedAccountId;
    }

    const trigger = await composioInstance.triggers.create(
      config.userId,
      triggerSlug,
      requestBody
    );

    console.log(`✅ Trigger created: ${triggerSlug}`, trigger.triggerId);
    return trigger;
  } catch (error) {
    console.error(`❌ Failed to create trigger: ${triggerSlug}`, error);
    throw error;
  }
};

// List connected accounts
export const listConnectedAccounts = async (): Promise<ConnectedAccount[]> => {
  if (!isInitialized || !composioInstance) {
    throw new Error('Composio client not initialized');
  }
  
  try {
    const config = getConfig();
    const accounts = await composioInstance.connectedAccounts.list({
      userIds: [config.userId]
    });

    const mappedAccounts = accounts.items?.map(account => ({
      id: account.id,
      toolkit: account.toolkit?.slug || 'unknown',
      status: account.status as ConnectedAccount['status'],
      userId: config.userId
    })) || [];

    // Cache accounts
    connectedAccountsCache.clear();
    mappedAccounts.forEach(account => {
      connectedAccountsCache.set(account.toolkit, account);
    });

    return mappedAccounts;
  } catch (error) {
    console.error('❌ Failed to list connected accounts:', error);
    throw error;
  }
};

// Get active Gmail account
export const getActiveGmailAccount = async (): Promise<ConnectedAccount | null> => {
  // Check cache first
  if (connectedAccountsCache.has('gmail')) {
    const cached = connectedAccountsCache.get('gmail')!;
    if (cached.status === 'ACTIVE') return cached;
  }

  // Refresh accounts if not cached or inactive
  const accounts = await listConnectedAccounts();
  const activeGmailAccounts = accounts.filter(acc => 
    acc.toolkit === 'gmail' && acc.status === 'ACTIVE'
  );
  
  if (activeGmailAccounts.length === 0) {
    console.warn('⚠️ No active Gmail accounts found');
    return null;
  }
  
  if (activeGmailAccounts.length > 1) {
    console.warn(`⚠️ Found ${activeGmailAccounts.length} active Gmail accounts. Using the first one.`);
  }
  
  return activeGmailAccounts[0];
};

// Get active Todoist account
export const getActiveTodoistAccount = async (): Promise<ConnectedAccount | null> => {
  // Check cache first
  if (connectedAccountsCache.has('todoist')) {
    const cached = connectedAccountsCache.get('todoist')!;
    if (cached.status === 'ACTIVE') return cached;
  }

  // Refresh accounts if not cached or inactive
  const accounts = await listConnectedAccounts();
  const activeTodoistAccounts = accounts.filter(acc => 
    acc.toolkit === 'todoist' && acc.status === 'ACTIVE'
  );
  
  if (activeTodoistAccounts.length === 0) {
    console.warn('⚠️ No active Todoist accounts found');
    return null;
  }
  
  return activeTodoistAccounts[0];
};