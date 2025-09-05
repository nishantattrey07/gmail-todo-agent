// Batch Processing - runs every 15 minutes to check for new emails
import { processEmails, getProcessingStats } from './email-processor';

export interface BatchProcessingConfig {
  intervalMinutes: number;
  maxEmailsPerBatch: number;
  enabled: boolean;
  runOnStartup: boolean;
}

export interface BatchProcessingStats {
  totalRuns: number;
  totalEmailsProcessed: number;
  totalTasksCreated: number;
  lastRunTime?: Date;
  nextRunTime?: Date;
  averageProcessingTime: number;
  isRunning: boolean;
}

// Global batch processing state (functional approach)
let batchConfig: BatchProcessingConfig = {
  intervalMinutes: 15, // Run every 15 minutes
  maxEmailsPerBatch: 50,
  enabled: true,
  runOnStartup: true
};

let batchStats: BatchProcessingStats = {
  totalRuns: 0,
  totalEmailsProcessed: 0,
  totalTasksCreated: 0,
  averageProcessingTime: 0,
  isRunning: false
};

let batchInterval: NodeJS.Timeout | null = null;

// Start batch processing
export const startBatchProcessing = async (config?: Partial<BatchProcessingConfig>): Promise<void> => {
  // Update config if provided
  if (config) {
    batchConfig = { ...batchConfig, ...config };
  }

  if (!batchConfig.enabled) {
    console.log(' Batch processing is disabled');
    return;
  }

  console.log(`Starting batch processing (every ${batchConfig.intervalMinutes} minutes)`);

  // Run on startup if configured
  if (batchConfig.runOnStartup) {
    console.log('Running initial batch processing...');
    await runBatchProcessing();
  }

  // Set up recurring batch processing
  const intervalMs = batchConfig.intervalMinutes * 60 * 1000;
  batchInterval = setInterval(async () => {
    await runBatchProcessing();
  }, intervalMs);

  // Calculate next run time
  batchStats.nextRunTime = new Date(Date.now() + intervalMs);
  
  console.log(`✅ Batch processing started. Next run: ${batchStats.nextRunTime.toLocaleTimeString()}`);
};

// Stop batch processing
export const stopBatchProcessing = (): void => {
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
    batchStats.nextRunTime = undefined;
    console.log('🛑 Batch processing stopped');
  }
};

// Run a single batch processing cycle
export const runBatchProcessing = async (): Promise<BatchProcessingStats> => {
  if (batchStats.isRunning) {
    console.log(' Batch processing already running, skipping this cycle');
    return batchStats;
  }

  const startTime = Date.now();
  batchStats.isRunning = true;
  batchStats.totalRuns++;

  try {
    console.log(` Starting batch processing cycle #${batchStats.totalRuns} (max ${batchConfig.maxEmailsPerBatch} emails)`);

    // Get processing stats before
    const statsBefore = getProcessingStats();

    // Process emails following user's specification:
    // 1. Unread emails without any TodoAgent tags (fresh emails)
    // 2. Unread emails with ONLY TodoAgent_Failed (retry failed)
    // 3. Exclude emails with TodoAgent_Processed or TodoAgent_Skip (already done)
    
    const isStartupRun = batchStats.totalRuns === 1 && batchConfig.runOnStartup;
    
    // Build query to exclude already processed emails but include failed ones for retry
    const query = isStartupRun 
      ? `is:unread newer_than:1d -label:"TodoAgent_Processed" -label:"TodoAgent_Skip"`  
      : `is:unread -label:"TodoAgent_Processed" -label:"TodoAgent_Skip"`;
    
    if (isStartupRun) {
      console.log(' Startup run: Processing unread emails from last 24 hours (catching up + retry failed)');
    } else {
      console.log(' Regular batch: Processing unread emails (fresh + failed retry, excluding processed/skip)');
    }
    
    console.log(` Gmail query: "${query}"`);
    
    const results = await processEmails({
      query,
      maxResults: batchConfig.maxEmailsPerBatch
    });

    // Get processing stats after
    const statsAfter = getProcessingStats();

    // Update batch statistics
    const emailsProcessed = results.length;
    const tasksCreated = statsAfter.tasksCreated - statsBefore.tasksCreated;
    const processingTime = Date.now() - startTime;

    batchStats.totalEmailsProcessed += emailsProcessed;
    batchStats.totalTasksCreated += tasksCreated;
    batchStats.lastRunTime = new Date();
    batchStats.averageProcessingTime = (batchStats.averageProcessingTime * (batchStats.totalRuns - 1) + processingTime) / batchStats.totalRuns;

    // Calculate next run time
    if (batchInterval) {
      const intervalMs = batchConfig.intervalMinutes * 60 * 1000;
      batchStats.nextRunTime = new Date(Date.now() + intervalMs);
    }

    // Log results
    if (emailsProcessed > 0) {
      console.log(`✅ Batch processing complete: ${emailsProcessed} emails processed, ${tasksCreated} tasks created in ${Math.round(processingTime/1000)}s`);
      console.log(`📊 Total: ${batchStats.totalRuns} runs, ${batchStats.totalEmailsProcessed} emails, ${batchStats.totalTasksCreated} tasks`);
    } else {
      console.log(`📦 Batch processing complete: No new emails to process`);
    }

    if (batchStats.nextRunTime) {
      console.log(`⏰ Next batch run: ${batchStats.nextRunTime.toLocaleTimeString()}`);
    }

  } catch (error) {
    console.error('❌ Batch processing failed:', error);
  } finally {
    batchStats.isRunning = false;
  }

  return { ...batchStats };
};

// Get batch processing statistics
export const getBatchProcessingStats = (): BatchProcessingStats => {
  return { ...batchStats };
};

// Update batch processing configuration
export const updateBatchConfig = (newConfig: Partial<BatchProcessingConfig>): BatchProcessingConfig => {
  const wasEnabled = batchConfig.enabled;
  batchConfig = { ...batchConfig, ...newConfig };

  // If enabling/disabling, restart batch processing
  if (wasEnabled !== batchConfig.enabled) {
    if (batchConfig.enabled) {
      console.log('📦 Batch processing enabled');
      startBatchProcessing();
    } else {
      console.log('📦 Batch processing disabled');
      stopBatchProcessing();
    }
  } else if (batchConfig.enabled && batchInterval) {
    // If just changing interval, restart with new timing
    stopBatchProcessing();
    startBatchProcessing();
  }

  return { ...batchConfig };
};

// Get current batch configuration
export const getBatchConfig = (): BatchProcessingConfig => {
  return { ...batchConfig };
};

// Manual batch run (for testing)
export const runManualBatch = async (maxEmails?: number): Promise<BatchProcessingStats> => {
  const originalMax = batchConfig.maxEmailsPerBatch;
  if (maxEmails) {
    batchConfig.maxEmailsPerBatch = maxEmails;
  }

  console.log('🔧 Running manual batch processing...');
  const result = await runBatchProcessing();

  // Restore original config
  batchConfig.maxEmailsPerBatch = originalMax;
  
  return result;
};

// Reset batch statistics
export const resetBatchStats = (): void => {
  batchStats = {
    totalRuns: 0,
    totalEmailsProcessed: 0,
    totalTasksCreated: 0,
    averageProcessingTime: 0,
    isRunning: false,
    lastRunTime: undefined,
    nextRunTime: batchStats.nextRunTime // Keep next run time
  };
  console.log('📊 Batch processing statistics reset');
};