// Simple webhook server for Gmail triggers
import express from 'express';
import { processEmail } from './email-processor';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global server state
let server: any = null;

// Webhook endpoint for Gmail triggers (matching original /webhook pattern)
app.post('/webhook', async (req, res) => {
  try {
    console.log('📧 Received Gmail webhook:', {
      headers: req.headers,
      body: req.body
    });

    // Extract email data from webhook payload
    const payload = req.body;
    
    // Safely extract trigger info with fallbacks (matching original pattern)
    const triggerSlug = payload.type || payload.triggerSlug || payload.trigger || payload.eventType || 'UNKNOWN';
    
    // Handle Gmail message triggers (check multiple possible trigger identifiers)
    if (triggerSlug === 'gmail_new_gmail_message' ||
        triggerSlug === 'GMAIL_NEW_GMAIL_MESSAGE' || 
        triggerSlug.includes('gmail_new') ||
        triggerSlug.includes('GMAIL_NEW') || 
        triggerSlug.includes('NEW_GMAIL_MESSAGE')) {
      
      const emailId = payload.data?.message_id || payload.data?.id || payload.data?.messageId;
      
      if (emailId) {
        console.log(`📧 Processing webhook for email: ${emailId}`);
        
        // Process the email asynchronously
        processEmail(emailId).then(result => {
          if (result.success) {
            console.log(`✅ Webhook processing complete for ${emailId}: ${result.taskId ? `Task ${result.taskId} created` : 'Processed successfully'}`);
          } else {
            console.error(`❌ Webhook processing failed for ${emailId}: ${result.error}`);
          }
        }).catch(error => {
          console.error(`❌ Webhook processing error for ${emailId}:`, error);
        });

        // Return success immediately (don't make Composio wait)
        res.status(200).json({ 
          success: true, 
          message: 'Webhook received, processing email',
          emailId,
          trigger: triggerSlug,
          timestamp: new Date().toISOString()
        });
      } else {
        console.warn('⚠️ No email ID found in webhook payload');
        res.status(200).json({ 
          success: false, 
          message: 'No email ID in webhook payload',
          trigger: triggerSlug,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log(`ℹ️ Ignoring webhook for trigger: ${triggerSlug}`);
      res.status(200).json({ 
        success: true, 
        message: 'Webhook received but not processed (non-Gmail trigger)',
        trigger: triggerSlug,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    // Still return 200 to prevent retries, but log the error (matching original)
    res.status(200).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'gmail-todo-agent-webhook'
  });
});

// Start webhook server
export const startWebhookServer = async (port: number = 3001): Promise<{success: boolean, url?: string, error?: string}> => {
  try {
    if (server) {
      console.log('⚠️ Webhook server already running');
      return { success: true, url: `http://localhost:${port}` };
    }

    return new Promise((resolve) => {
      server = app.listen(port, '0.0.0.0', () => {
        const webhookUrl = `http://localhost:${port}`;
        console.log(`🌐 Webhook server started on ${webhookUrl}`);
        console.log(`📡 Gmail webhook endpoint: ${webhookUrl}/webhook/gmail`);
        resolve({ success: true, url: webhookUrl });
      });

      server.on('error', (error: Error) => {
        console.error('❌ Webhook server error:', error);
        resolve({ success: false, error: error.message });
      });
    });

  } catch (error) {
    console.error('❌ Failed to start webhook server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Stop webhook server
export const stopWebhookServer = async (): Promise<boolean> => {
  try {
    if (!server) {
      return true;
    }

    return new Promise((resolve) => {
      server.close(() => {
        console.log('🛑 Webhook server stopped');
        server = null;
        resolve(true);
      });
    });

  } catch (error) {
    console.error('❌ Failed to stop webhook server:', error);
    return false;
  }
};

// Get webhook URL for current server (matching original /webhook pattern)
export const getWebhookUrl = (port: number = 3001): string => {
  return `http://localhost:${port}/webhook`;
};