// Phase 3: AI-Enhanced Gmail-Todo Agent
import { initializeApp, startRealTimeProcessing, runManualProcessing, startBatchProcessing, stopBatchProcessing, runManualBatchProcessing, getBatchStats, getAppStatus, shutdown } from './app';
import { getProcessingStats, resetProcessingStats } from './services/email-processor';
import { getClassificationStats, getSenderPatterns, clearHistory } from './services/ai-service';
import { getRuleStats, getRules } from './services/rule-engine';
import { 
  connectAll, connectGmail, connectTodoist, checkConnectionStatus, 
  testConnections, disconnectAll, disconnectToolkit, showConnectedAccounts,
  showConnectionInstructions 
} from './services/account-manager';

// Simple CLI handling
const command = process.argv[2];
const port = parseInt(process.env.WEBHOOK_PORT || '3001');

async function main() {
  try {
    switch (command) {
      case 'start':
        // Start real-time processing
        console.log('Starting Gmail-Todo Agent in real-time mode...');
        const result = await startRealTimeProcessing(port);
        if (result.success) {
          console.log('✅ Agent is running! New Gmail messages will be automatically processed.');
          console.log('Press Ctrl+C to stop.');
          
          // Keep alive
          setInterval(() => {}, 1000);
        } else {
          console.error('❌ Failed to start:', result.error);
          process.exit(1);
        }
        break;

      case 'process':
        // Manual processing
        const maxEmails = parseInt(process.argv[3] || '5');
        const processResult = await runManualProcessing(maxEmails);
        if (processResult.success) {
          console.log(`✅ Processed ${processResult.processed} emails`);
        } else {
          console.error('❌ Processing failed:', processResult.error);
          process.exit(1);
        }
        break;

      case 'status':
        // Show status
        await initializeApp();
        const status = await getAppStatus();
        console.log('📊 Gmail-Todo Agent Status:');
        console.log(`  Initialized: ${status.initialized}`);
        console.log(`  Webhook Server: ${status.webhookServerRunning ? '🟢 Running' : '🔴 Stopped'}`);
        console.log(`  Gmail Trigger: ${status.gmailTriggerActive ? '🟢 Active' : '🔴 Inactive'}`);
        console.log(`  Batch Processing: ${status.batchProcessingRunning ? '🟢 Running' : '🔴 Stopped'}`);
        if (status.webhookUrl) {
          console.log(`  Webhook URL: ${status.webhookUrl}/webhook`);
        }
        console.log(`  Active Triggers: ${status.activeTriggers.length}`);
        status.activeTriggers.forEach(trigger => {
          console.log(`    - ${trigger.slug}: ${trigger.status}`);
        });
        
        // Show batch processing stats if available
        if (status.batchStats) {
          const batch = status.batchStats;
          console.log(`\n Batch Processing Stats:`);
          console.log(`  Total Runs: ${batch.totalRuns}`);
          console.log(`  Emails Processed: ${batch.totalEmailsProcessed}`);
          console.log(`  Tasks Created: ${batch.totalTasksCreated}`);
          console.log(`  Last Run: ${batch.lastRunTime ? batch.lastRunTime.toLocaleTimeString() : 'Never'}`);
          console.log(`  Next Run: ${batch.nextRunTime ? batch.nextRunTime.toLocaleTimeString() : 'Not scheduled'}`);
          console.log(`  Currently Running: ${batch.isRunning ? 'Yes' : 'No'}`);
        }
        break;

      case 'test':
        // Test connections
        console.log('Testing connections...');
        const initResult = await initializeApp();
        if (initResult.success) {
          const testStatus = await getAppStatus();
          console.log('✅ All tests passed!');
          console.log(`Found ${testStatus.activeTriggers.length} active triggers`);
        } else {
          console.error('❌ Test failed:', initResult.error);
          process.exit(1);
        }
        break;

      case 'stats':
        // Show processing and AI statistics
        await initializeApp();
        const stats = getProcessingStats();
        const aiStats = getClassificationStats();
        const ruleStats = getRuleStats();
        
        console.log('📊 Gmail-Todo Agent Statistics:');
        console.log('\n Email Processing:');
        console.log(`  Total Processed: ${stats.totalProcessed}`);
        console.log(`  Tasks Created: ${stats.tasksCreated}`);
        console.log(`  Rule Matched: ${stats.ruleMatched}`);
        console.log(`  AI Processed: ${stats.aiProcessed}`);
        console.log(`  Skipped: ${stats.skipped}`);
        console.log(`  Failed: ${stats.failed}`);
        console.log(`  Avg Processing Time: ${stats.totalProcessed > 0 ? Math.round(stats.processingTime / stats.totalProcessed) : 0}ms`);
        
        console.log('\n🤖 AI Classification:');
        Object.entries(aiStats).forEach(([label, count]) => {
          console.log(`  ${label}: ${count}`);
        });
        
        console.log('\n🔧 Rule Engine:');
        Object.entries(ruleStats).forEach(([ruleName, matches]) => {
          console.log(`  ${ruleName}: ${matches} matches`);
        });
        break;

      case 'patterns':
        // Show AI learning patterns
        await initializeApp();
        const senderPatterns = getSenderPatterns();
        
        console.log('🧠 AI Learning Patterns:');
        if (Object.keys(senderPatterns).length === 0) {
          console.log('  No patterns learned yet. Process more emails to see patterns.');
        } else {
          Object.entries(senderPatterns).forEach(([sender, data]) => {
            console.log(`  ${sender}: ${data.label} (${data.count} samples, ${Math.round(data.confidence * 100)}% confidence)`);
          });
        }
        break;

      case 'rules':
        // Show active rules
        await initializeApp();
        const rules = getRules();
        
        console.log('🔧 Email Processing Rules:');
        rules.forEach(rule => {
          const status = rule.active ? '🟢' : '🔴';
          console.log(`  ${status} ${rule.name} (Priority: ${rule.priority}, Matches: ${rule.stats.matched})`);
          console.log(`      ${rule.description}`);
          if (rule.actions.label) {
            console.log(`      → ${rule.actions.label}`);
          }
        });
        break;

      case 'clear':
        // Clear AI learning history
        const subCommand = process.argv[3];
        if (subCommand === 'ai') {
          clearHistory();
          console.log('🧹 AI learning history cleared');
        } else if (subCommand === 'stats') {
          resetProcessingStats();
          console.log('📊 Processing statistics reset');
        } else {
          console.log('Usage: clear [ai|stats]');
          console.log('  clear ai     - Clear AI learning history');
          console.log('  clear stats  - Reset processing statistics');
        }
        break;

      case 'batch':
        // Batch processing management
        const batchSubCommand = process.argv[3];
        try {
          switch (batchSubCommand) {
            case 'start':
              const batchResult = await startBatchProcessing();
              if (batchResult.success) {
                console.log('✅ Batch processing started (15-minute intervals)');
              } else {
                console.error('❌ Failed to start batch processing:', batchResult.error);
                process.exit(1);
              }
              break;
            case 'stop':
              const stopResult = await stopBatchProcessing();
              if (stopResult.success) {
                console.log('✅ Batch processing stopped');
              } else {
                console.error('❌ Failed to stop batch processing');
                process.exit(1);
              }
              break;
            case 'run':
              const maxEmails = parseInt(process.argv[4] || '10');
              const runResult = await runManualBatchProcessing(maxEmails);
              if (runResult.success) {
                console.log(`✅ Manual batch complete: ${runResult.processed} emails processed`);
              } else {
                console.error('❌ Manual batch failed:', runResult.error);
                process.exit(1);
              }
              break;
            case 'stats':
              const batchStats = getBatchStats();
              console.log('📦 Batch Processing Statistics:');
              console.log(`  Total Runs: ${batchStats.totalRuns}`);
              console.log(`  Emails Processed: ${batchStats.totalEmailsProcessed}`);
              console.log(`  Tasks Created: ${batchStats.totalTasksCreated}`);
              console.log(`  Average Processing Time: ${Math.round(batchStats.averageProcessingTime/1000)}s`);
              console.log(`  Last Run: ${batchStats.lastRunTime ? batchStats.lastRunTime.toLocaleString() : 'Never'}`);
              console.log(`  Next Run: ${batchStats.nextRunTime ? batchStats.nextRunTime.toLocaleString() : 'Not scheduled'}`);
              console.log(`  Currently Running: ${batchStats.isRunning ? 'Yes' : 'No'}`);
              break;
            case undefined:
            case 'help':
            default:
              console.log('Usage: batch [start|stop|run|stats|help]');
              console.log('  start       - Start automatic batch processing (15-minute intervals)');
              console.log('  stop        - Stop batch processing');
              console.log('  run [N]     - Run manual batch processing (default N=10)');
              console.log('  stats       - Show batch processing statistics');
          }
        } catch (error) {
          console.error('❌ Batch command failed:', error);
          process.exit(1);
        }
        break;

      case 'connect':
        // Account connection management
        const connectSubCommand = process.argv[3];
        try {
          switch (connectSubCommand) {
            case 'gmail':
              await connectGmail();
              break;
            case 'todoist':
              await connectTodoist();
              break;
            case 'status':
              await checkConnectionStatus();
              break;
            case 'test':
              const testResult = await testConnections();
              console.log('\n🧪 Connection Test Results:');
              console.log(`  Gmail: ${testResult.gmail ? '✅ Working' : '❌ Failed'}`);
              console.log(`  Todoist: ${testResult.todoist ? '✅ Working' : '❌ Failed'}`);
              break;
            case 'list':
              await showConnectedAccounts();
              break;
            case 'help':
              showConnectionInstructions();
              break;
            case undefined:
            case 'all':
              await connectAll();
              break;
            default:
              console.log('❌ Unknown connect command');
              console.log('Usage: connect [gmail|todoist|all|status|test|list|help]');
          }
        } catch (error) {
          console.error('❌ Connection failed:', error);
          process.exit(1);
        }
        break;

      case 'disconnect':
        // Account disconnection management
        const disconnectSubCommand = process.argv[3];
        try {
          switch (disconnectSubCommand) {
            case 'gmail':
              await disconnectToolkit('gmail');
              break;
            case 'todoist':
              await disconnectToolkit('todoist');
              break;
            case 'all':
              await disconnectAll();
              break;
            case 'list':
              await showConnectedAccounts();
              break;
            case undefined:
              await showConnectedAccounts();
              console.log('\nUsage: disconnect [gmail|todoist|all|list]');
              break;
            default:
              console.log('❌ Unknown disconnect command');
              console.log('Usage: disconnect [gmail|todoist|all|list]');
          }
        } catch (error) {
          console.error('❌ Disconnection failed:', error);
          process.exit(1);
        }
        break;

      case 'help':
      default:
        console.log('📧 Gmail-Todo Agent - Phase 3 (AI-Enhanced)');
        console.log('');
        console.log('Commands:');
        console.log('');
        console.log('🔗 Account Management:');
        console.log('  connect [gmail|todoist|all|status|test|list|help]');
        console.log('  disconnect [gmail|todoist|all|list]');
        console.log('');
        console.log('🚀 Email Processing:');
        console.log('  start       - Start real-time processing with webhooks');
        console.log('  process [N] - Run manual email processing (batch mode, default N=5)');
        console.log('  batch       - Manage batch processing (15-minute intervals)');
        console.log('  test        - Test connections and basic functionality');
        console.log('');
        console.log('📊 Monitoring:');
        console.log('  status      - Show agent and connection status');
        console.log('  stats       - Show processing and AI statistics');
        console.log('  patterns    - Show AI learning patterns');
        console.log('  rules       - Show active email processing rules');
        console.log('');
        console.log('🧹 Maintenance:');
        console.log('  clear <type>- Clear AI history or statistics');
        console.log('  help        - Show this help');
        console.log('');
        console.log('Environment Variables:');
        console.log('  COMPOSIO_API_KEY      - Required: Your Composio API key');
        console.log('  OPENAI_API_KEY        - Optional: OpenAI API key for AI classification');
        console.log('  COMPOSIO_USER_ID      - Optional: User ID (default: "default")');
        console.log('  WEBHOOK_PORT          - Optional: Webhook server port (default: 3001)');
        console.log('');
        console.log('Features:');
        console.log('  • Rule-based email classification');
        console.log('  • AI-powered smart categorization (with OpenAI key)');
        console.log('  • Real-time Gmail webhook processing');
        console.log('  • Automatic Todoist task creation');
        console.log('  • Learning from email patterns');
        break;
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

// Run CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;