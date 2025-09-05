// Phase 2: Real-time Gmail-Todo Agent with webhook triggers
import dotenv from 'dotenv';
import { initializeComposio } from './services/composio';
import { processEmails } from './services/email-processor';
import { createGmailTrigger, listActiveTriggers, hasGmailTrigger } from './services/triggers';
import { startWebhookServer, stopWebhookServer, getWebhookUrl } from './services/webhook-server';
import { 
  startBatchProcessing as startBatchProcessor, 
  stopBatchProcessing as stopBatchProcessor, 
  runManualBatch,
  getBatchProcessingStats,
  updateBatchConfig,
  BatchProcessingConfig,
  BatchProcessingStats
} from './services/batch-processor';

// Load environment variables
dotenv.config();

// Simple logger
const log = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args)
};

// App state
interface AppState {
  initialized: boolean;
  webhookServerRunning: boolean;
  gmailTriggerActive: boolean;
  batchProcessingRunning: boolean;
  webhookUrl?: string;
  triggerId?: string;
}

let appState: AppState = {
  initialized: false,
  webhookServerRunning: false,
  gmailTriggerActive: false,
  batchProcessingRunning: false
};

// Initialize all services
export const initializeApp = async (): Promise<{success: boolean, error?: string}> => {
  try {
    if (appState.initialized) {
      return { success: true };
    }

    log.info('🚀 Initializing Gmail-Todo Agent (Phase 2)');

    // Check required environment variables
    const composioApiKey = process.env.COMPOSIO_API_KEY;
    if (!composioApiKey) {
      throw new Error('COMPOSIO_API_KEY environment variable is required');
    }

    // Initialize Composio
    log.info('📡 Initializing Composio client...');
    await initializeComposio(composioApiKey);

    // Try to initialize AI service if OpenAI key is available
    if (process.env.OPENAI_API_KEY) {
      const { initializeAI } = await import('./services/ai-service');
      const aiResult = await initializeAI();
      if (aiResult.success) {
        log.info('✅ AI service initialized and ready');
      } else {
        log.warn(`⚠️ AI service unavailable: ${aiResult.error} - will use basic classification`);
      }
    } else {
      log.info('ℹ️ No OpenAI API key - AI features disabled');
    }

    appState.initialized = true;
    log.info('✅ App initialization complete');
    return { success: true };

  } catch (error) {
    log.error('❌ App initialization failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Start real-time processing (webhook server + trigger)
export const startRealTimeProcessing = async (port: number = 3001): Promise<{success: boolean, error?: string}> => {
  try {
    if (!appState.initialized) {
      const initResult = await initializeApp();
      if (!initResult.success) {
        return initResult;
      }
    }

    log.info('🌐 Starting real-time processing...');

    // Start webhook server
    const serverResult = await startWebhookServer(port);
    if (!serverResult.success) {
      return { success: false, error: `Failed to start webhook server: ${serverResult.error}` };
    }

    appState.webhookServerRunning = true;
    appState.webhookUrl = serverResult.url;

    // Check if Gmail trigger already exists
    const hasTrigger = await hasGmailTrigger();
    if (hasTrigger) {
      log.info('Gmail trigger already exists and is active');
      appState.gmailTriggerActive = true;
    } else {
      // Create Gmail trigger
      const webhookUrl = getWebhookUrl(port);
      // log.info('Creating Gmail trigger...');
      
      const triggerResult = await createGmailTrigger(webhookUrl);
      if (triggerResult.success) {
        appState.gmailTriggerActive = true;
        appState.triggerId = triggerResult.triggerId;
        log.info('Gmail trigger created successfully');
      } else {
        log.warn(`⚠️ Failed to create Gmail trigger: ${triggerResult.error}`);
        log.info(' Will continue with webhook server only (manual processing available)');
      }
    }

    // Also start batch processing for backup/startup processing
    log.info('Starting batch processing...');
    await startBatchProcessor();
    appState.batchProcessingRunning = true;
    log.info('Batch processing started (15-minute intervals)');

    log.info(' Real-time processing started!');
    log.info(`Webhook URL: ${getWebhookUrl(port)}`);
    // log.info(' New Gmail messages will now be automatically processed');
    log.info(' Batch processing will also run every 15 minutes as backup');

    return { success: true };

  } catch (error) {
    log.error('❌ Failed to start real-time processing:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Stop real-time processing
export const stopRealTimeProcessing = async (): Promise<{success: boolean}> => {
  try {
    log.info('🛑 Stopping real-time processing...');

    // Stop webhook server
    const stopped = await stopWebhookServer();
    if (stopped) {
      appState.webhookServerRunning = false;
      appState.webhookUrl = undefined;
      log.info('✅ Webhook server stopped');
    }

    // Note: We don't delete the Gmail trigger as it can be reused
    log.info('✅ Real-time processing stopped');
    return { success: true };

  } catch (error) {
    log.error('❌ Failed to stop real-time processing:', error);
    return { success: false };
  }
};

// Manual email processing (for testing/backup) - npm run dev process / npm run dev process 1
export const runManualProcessing = async (maxEmails: number = 5): Promise<{success: boolean, processed: number, error?: string}> => {
  try {
    if (!appState.initialized) {
      const initResult = await initializeApp();
      if (!initResult.success) {
        return { success: false, processed: 0, error: initResult.error };
      }
    }

    log.info(` Running manual processing (max ${maxEmails} emails)...`);
    const results = await processEmails({ query: 'is:unread', maxResults: maxEmails });
    
    const successCount = results.filter(r => r.success).length;
    const taskCount = results.filter(r => r.taskId).length;
    
    log.info(`✅ Manual processing complete: ${successCount}/${results.length} emails processed, ${taskCount} tasks created`);
    return { success: true, processed: results.length };

  } catch (error) {
    log.error('❌ Manual processing failed:', error);
    return { success: false, processed: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Start batch processing (15-minute intervals)
export const startBatchProcessing = async (config?: Partial<BatchProcessingConfig>): Promise<{success: boolean, error?: string}> => {
  try {
    if (!appState.initialized) {
      const initResult = await initializeApp();
      if (!initResult.success) {
        return initResult;
      }
    }

    log.info('Starting batch processing...');
    await startBatchProcessor(config);
    appState.batchProcessingRunning = true;
    log.info('✅ Batch processing started (15-minute intervals)');
    return { success: true };

  } catch (error) {
    log.error('❌ Failed to start batch processing:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Stop batch processing
export const stopBatchProcessing = async (): Promise<{success: boolean}> => {
  try {
    log.info('🛑 Stopping batch processing...');
    stopBatchProcessor();
    appState.batchProcessingRunning = false;
    log.info('✅ Batch processing stopped');
    return { success: true };

  } catch (error) {
    log.error('❌ Failed to stop batch processing:', error);
    return { success: false };
  }
};

// Run manual batch processing
export const runManualBatchProcessing = async (maxEmails?: number): Promise<{success: boolean, processed: number, error?: string}> => {
  try {
    if (!appState.initialized) {
      const initResult = await initializeApp();
      if (!initResult.success) {
        return { success: false, processed: 0, error: initResult.error };
      }
    }

    log.info('🔧 Running manual batch processing...');
    const stats = await runManualBatch(maxEmails);
    
    log.info(`✅ Manual batch complete: ${stats.totalEmailsProcessed} emails processed, ${stats.totalTasksCreated} tasks created`);
    return { success: true, processed: stats.totalEmailsProcessed };

  } catch (error) {
    log.error('❌ Manual batch processing failed:', error);
    return { success: false, processed: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Get batch processing statistics
export const getBatchStats = (): BatchProcessingStats => {
  return getBatchProcessingStats();
};

// Update batch configuration
export const updateBatchConfiguration = (newConfig: Partial<BatchProcessingConfig>): BatchProcessingConfig => {
  return updateBatchConfig(newConfig);
};

// Get app status
export const getAppStatus = async (): Promise<AppState & {activeTriggers: any[], batchStats: BatchProcessingStats}> => {
  const activeTriggers = await listActiveTriggers();
  const batchStats = getBatchProcessingStats();
  return { ...appState, activeTriggers, batchStats };
};

// Graceful shutdown
export const shutdown = async (): Promise<void> => {
  log.info('🛑 Shutting down Gmail-Todo Agent...');
  await stopRealTimeProcessing();
  await stopBatchProcessing();
  log.info('👋 Shutdown complete');
};