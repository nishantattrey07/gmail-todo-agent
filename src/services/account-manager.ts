// Account connection/disconnection
import { initializeComposio, getComposio, listConnectedAccounts } from './composio';
import { ConnectedAccount } from '../core/types';

export interface ConnectionResult {
  toolkit: string;
  success: boolean;
  connectionId?: string;
  redirectUrl?: string | null;
  status: 'ACTIVE' | 'INITIATED' | 'FAILED' | 'ERROR';
  error?: string;
}

export interface DisconnectionResult {
  toolkit: string;
  connectionId: string;
  success: boolean;
  error?: string;
}

// Check connection status
export const checkConnectionStatus = async (): Promise<{ gmail: boolean; todoist: boolean; accounts: ConnectedAccount[] }> => {
  try {
    console.log('Checking existing connections...');
    
    await initializeComposio();
    const accounts = await listConnectedAccounts();
    
    const connectionStatus = {
      gmail: false,
      todoist: false
    };

    if (accounts.length === 0) {
      console.log(' No connected accounts found');
      return { ...connectionStatus, accounts };
    }

    console.log(` Found ${accounts.length} connected accounts:`);
    
    accounts.forEach(account => {
      const toolkit = account.toolkit.toLowerCase();
      const status = account.status;
      const statusEmoji = status === 'ACTIVE' ? '✅' : status === 'INACTIVE' ? '❌' : '⏳';
      
      console.log(`  ${statusEmoji} ${toolkit.toUpperCase()}: ${status} (ID: ${account.id})`);
      
      // Only consider ACTIVE connections as valid
      if (toolkit === 'gmail' && status === 'ACTIVE') {
        connectionStatus.gmail = true;
      } else if (toolkit === 'todoist' && status === 'ACTIVE') {
        connectionStatus.todoist = true;
      }
      
      // Log non-active connections for debugging
      if (status !== 'ACTIVE') {
        console.log(`  ⚠️  ${toolkit} connection is ${status} - needs attention`);
      }
    });

    return { ...connectionStatus, accounts };

  } catch (error: any) {
    console.error('❌ Failed to check connection status:', error.message);
    return { gmail: false, todoist: false, accounts: [] };
  }
};


export const connectGmail = async (): Promise<ConnectionResult> => {
  try {
    console.log('\n Starting Gmail connection...');
    
    await initializeComposio();
    const composio = getComposio();
    const userId = process.env.COMPOSIO_USER_ID || 'default';
    
    console.log('Initiating Gmail OAuth flow...');
    
    // toolkit authorization method
    const connectionRequest = await composio.toolkits.authorize(userId, 'gmail');
    
    console.log('Visit this URL to authenticate Gmail:');
    console.log(`👉 ${connectionRequest.redirectUrl}`);
    console.log('\n Waiting for Gmail connection... (120 seconds timeout)');
    
    // Wait for connection with timeout
    await connectionRequest.waitForConnection(120000); // 120 seconds
    
    console.log('✅ Gmail connected successfully!');
    
    return {
      toolkit: 'Gmail',
      success: true,
      connectionId: connectionRequest.id,
      redirectUrl: connectionRequest.redirectUrl,
      status: 'ACTIVE'
    };

  } catch (error: any) {
    console.error('❌ Gmail connection failed:', error.message);
    
    return {
      toolkit: 'Gmail',
      success: false,
      error: error.message,
      status: 'ERROR'
    };
  }
};

// Connect Todoist account
export const connectTodoist = async (): Promise<ConnectionResult> => {
  try {
    console.log('\n Starting Todoist connection...');
    
    await initializeComposio();
    const composio = getComposio();
    const userId = process.env.COMPOSIO_USER_ID || 'default';
    
    console.log(' Initiating Todoist OAuth flow...');
    
    // Use the newer toolkit authorization method
    const connectionRequest = await composio.toolkits.authorize(userId, 'todoist');
    
    console.log(' Visit this URL to authenticate Todoist:');
    console.log(`👉 ${connectionRequest.redirectUrl}`);
    console.log('\n Waiting for Todoist connection... (120 seconds timeout)');
    
    // Wait for connection with timeout
    await connectionRequest.waitForConnection(120000); // 120 seconds
    
    console.log('✅ Todoist connected successfully!');
    
    return {
      toolkit: 'Todoist',
      success: true,
      connectionId: connectionRequest.id,
      redirectUrl: connectionRequest.redirectUrl,
      status: 'ACTIVE'
    };

  } catch (error: any) {
    console.error('❌ Todoist connection failed:', error.message);
    
    return {
      toolkit: 'Todoist',
      success: false,
      error: error.message,
      status: 'ERROR'
    };
  }
};

// Test connections by making API calls
export const testConnections = async (): Promise<{ gmail: boolean; todoist: boolean }> => {
  const { gmail: gmailConnected, todoist: todoistConnected, accounts } = await checkConnectionStatus();
  const testResults = { gmail: false, todoist: false };

  if (gmailConnected) {
    try {
      console.log('\n Testing Gmail connection...');
      const composio = getComposio();
      const userId = process.env.COMPOSIO_USER_ID || 'default';
      
      const gmailAccount = accounts.find(acc => acc.toolkit === 'gmail' && acc.status === 'ACTIVE');
      if (gmailAccount) {
        // Test basic Gmail operation
        await composio.tools.execute('GMAIL_LIST_LABELS', {
          userId,
          connectedAccountId: gmailAccount.id,
          arguments: { user_id: 'me' }
        });
        
        console.log('✅ Gmail connection test passed');
        testResults.gmail = true;
      }
    } catch (error) {
      console.error('❌ Gmail connection test failed:', error);
    }
  }

  if (todoistConnected) {
    try {
      console.log('\n Testing Todoist connection...');
      const composio = getComposio();
      const userId = process.env.COMPOSIO_USER_ID || 'default';
      
      const todoistAccount = accounts.find(acc => acc.toolkit === 'todoist' && acc.status === 'ACTIVE');
      if (todoistAccount) {
        // Test basic Todoist operation
        await composio.tools.execute('TODOIST_GET_ALL_PROJECTS', {
          userId,
          connectedAccountId: todoistAccount.id,
          arguments: {}
        });
        
        console.log('✅ Todoist connection test passed');
        testResults.todoist = true;
      }
    } catch (error) {
      console.error('❌ Todoist connection test failed:', error);
    }
  }

  return testResults;
};

// Connect all required accounts
export const connectAll = async (): Promise<ConnectionResult[]> => {
  console.log(' Starting Gmail + Todoist connection process...\n');
  
  // Check existing connections first  
  const { gmail, todoist } = await checkConnectionStatus();
  
  const results: ConnectionResult[] = [];
  
  // Connect Gmail if not already active
  if (!gmail) {
    const gmailResult = await connectGmail();
    results.push(gmailResult);
  } else {
    console.log('✅ Gmail already connected - skipping\n');
  }
  
  // Connect Todoist if not already active
  if (!todoist) {
    const todoistResult = await connectTodoist();
    results.push(todoistResult);
  } else {
    console.log('✅ Todoist already connected - skipping\n');
  }
  
  // Summary
  if (results.length > 0) {
    console.log('\n Connection Summary:');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${result.toolkit}: ${result.success ? 'Connected' : result.error}`);
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n ${successCount}/${results.length} accounts connected successfully!`);
  } else {
    console.log('\n All required accounts are already connected!');
  }

  // Test all connections
  console.log('\n Testing all connections...');
  await testConnections();
  
  return results;
};

// Disconnect account by ID
export const disconnectById = async (connectionId: string): Promise<DisconnectionResult> => {
  try {
    console.log(` Disconnecting account: ${connectionId}`);
    
    await initializeComposio();
    const composio = getComposio();
    
    // Get account details first
    const accounts = await listConnectedAccounts();
    const account = accounts.find(acc => acc.id === connectionId);
    const toolkit = account?.toolkit || 'Unknown';
    
    // Delete the connection completely
    await composio.connectedAccounts.delete(connectionId);
    
    console.log(`✅ Successfully disconnected ${toolkit} (${connectionId})`);
    
    return {
      toolkit,
      connectionId,
      success: true
    };

  } catch (error: any) {
    console.error(`❌ Failed to disconnect ${connectionId}:`, error.message);
    
    return {
      toolkit: 'Unknown',
      connectionId,
      success: false,
      error: error.message
    };
  }
};

// Disconnect all accounts for specific toolkit
export const disconnectToolkit = async (toolkit: string): Promise<DisconnectionResult[]> => {
  try {
    console.log(`\n Disconnecting all ${toolkit} accounts...\n`);
    
    const { accounts } = await checkConnectionStatus();

    if (accounts.length === 0) {
      console.log(' No connected accounts found');
      return [];
    }

    // Find all accounts for this toolkit
    const toolkitAccounts = accounts.filter(account => 
      account.toolkit.toLowerCase() === toolkit.toLowerCase()
    );

    if (toolkitAccounts.length === 0) {
      console.log(` No ${toolkit} accounts found`);
      return [];
    }

    console.log(`Found ${toolkitAccounts.length} ${toolkit} account(s) to disconnect:`);
    
    const results: DisconnectionResult[] = [];
    
    for (const account of toolkitAccounts) {
      const result = await disconnectById(account.id);
      results.push(result);
    }

    return results;

  } catch (error: any) {
    console.error(`❌ Failed to disconnect ${toolkit} accounts:`, error.message);
    return [];
  }
};

// Disconnect all Gmail and Todoist accounts
export const disconnectAll = async (): Promise<DisconnectionResult[]> => {
  console.log(' Disconnecting all Gmail and Todoist accounts...\n');
  
  const results: DisconnectionResult[] = [];
  
  // Disconnect all Gmail accounts
  const gmailResults = await disconnectToolkit('gmail');
  results.push(...gmailResults);
  
  // Disconnect all Todoist accounts
  const todoistResults = await disconnectToolkit('todoist');
  results.push(...todoistResults);
  
  // Summary
  console.log('\n Disconnection Summary:');
  if (results.length === 0) {
    console.log(' No accounts were disconnected (none found)');
  } else {
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${result.toolkit}: ${result.success ? 'Disconnected' : result.error}`);
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n ${successCount}/${results.length} accounts disconnected successfully!`);
  }
  
  return results;
};

// List all connected accounts with details
export const showConnectedAccounts = async (): Promise<void> => {
  try {
    console.log('\n Listing all connected accounts...\n');
    
    const { accounts } = await checkConnectionStatus();

    if (accounts.length === 0) {
      console.log(' No connected accounts found');
      return;
    }

    console.log(` Found ${accounts.length} connected accounts:\n`);
    
    accounts.forEach((account, index) => {
      const toolkit = account.toolkit || 'Unknown';
      const status = account.status || 'Unknown';
      const statusEmoji = status === 'ACTIVE' ? '✅' : '❌';
      
      console.log(`${index + 1}. ${statusEmoji} ${toolkit.toUpperCase()}`);
      console.log(`   ID: ${account.id}`);
      console.log(`   Status: ${status}`);
      console.log(`   User ID: ${account.userId}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Failed to list connected accounts:', error.message);
  }
};

// Show connection instructions
export const showConnectionInstructions = (): void => {
  console.log('\n Gmail-Todo Agent Connection Guide\n');
  
  console.log(' STEP 1: Set up environment variables in .env:');
  console.log('COMPOSIO_API_KEY=your_composio_api_key');
  console.log('COMPOSIO_USER_ID=your_user_id  # Optional, defaults to "default"');
  console.log('OPENAI_API_KEY=your_openai_api_key  # Optional, for AI features\n');
  
  console.log(' STEP 2: Get Composio API Key:');
  console.log('1. Go to: https://platform.composio.dev');
  console.log('2. Sign up/login to your account');
  console.log('3. Go to Settings → API Keys');
  console.log('4. Copy your API key to COMPOSIO_API_KEY\n');
  
  console.log(' STEP 3: Connect accounts:');
  console.log('npm run dev connect           # Connect both Gmail & Todoist');
  console.log('npm run dev connect gmail     # Connect only Gmail');
  console.log('npm run dev connect todoist   # Connect only Todoist');
  console.log('npm run dev connect status    # Check connection status\n');
  
  console.log(' STEP 4: Test connections:');
  console.log('npm run dev test              # Test all connections');
  console.log('npm run dev connect test      # Test with detailed output\n');
  
  console.log(' What happens during connection:');
  console.log('1. Composio will open OAuth flow in your browser');
  console.log('2. You authenticate with Gmail/Todoist');
  console.log('3. Composio receives the authorization');
  console.log('4. Connection is established and tested\n');
  
  console.log(' Troubleshooting:');
  console.log('• If connection fails: npm run dev disconnect all && npm run dev connect');
  console.log('• Check status anytime: npm run dev connect status');
  console.log('• List accounts: npm run dev connect list');
};