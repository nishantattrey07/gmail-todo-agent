// Simple Todoist service using Composio actions
import { executeAction, getActiveTodoistAccount } from './composio';
import { TaskData, EmailData } from '../core/types';

// Create a Todoist task
export const createTask = async (taskData: TaskData): Promise<{success: boolean, taskId?: string, error?: string}> => {
  try {
    const todoistAccount = await getActiveTodoistAccount();
    if (!todoistAccount) {
      return { success: false, error: 'No active Todoist account found' };
    }

    console.log(`📋 Creating task: ${taskData.title}`);
    
    // Clean up arguments - remove empty/invalid values that might cause "Invalid argument value"
    const cleanArgs: any = {
      content: taskData.title
    };
    
    if (taskData.description && taskData.description.trim()) {
      cleanArgs.description = taskData.description.trim();
    }
    
    if (taskData.priority && taskData.priority >= 1 && taskData.priority <= 4) {
      cleanArgs.priority = taskData.priority;
    }
    
    if (taskData.dueDate && taskData.dueDate.trim()) {
      cleanArgs.due_string = taskData.dueDate.trim();
    }
    
    if (taskData.projectId && taskData.projectId.trim()) {
      cleanArgs.project_id = taskData.projectId.trim();
    }
    
    if (taskData.labels && Array.isArray(taskData.labels) && taskData.labels.length > 0) {
      cleanArgs.labels = taskData.labels;
    }

    const result = await executeAction('TODOIST_CREATE_TASK', {
      connectedAccountId: todoistAccount.id,
      arguments: cleanArgs
    });

    // Try different possible ID fields based on Todoist API
    const taskId = result.data?.id || result.data?.task_id || result.id || result.task_id;
    
    if (taskId) {
      console.log(`✅ Task created with ID: ${taskId}`);
      return { success: true, taskId: taskId.toString() };
    }

    console.log('❌ No task ID found in result:', result);
    return { success: false, error: 'Task creation returned no ID' };

  } catch (error) {
    console.error('❌ Failed to create task:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Create task from email data
export const createTaskFromEmail = async (email: EmailData): Promise<{success: boolean, taskId?: string, error?: string}> => {
  // Extract sender name
  const senderName = email.from.split('<')[0].trim() || email.from;
  
  // Clean subject (remove Re:, Fwd:, etc.)
  const cleanSubject = email.subject.replace(/^(re:|fwd?:)\s*/i, '').trim();
  
  // Determine priority based on keywords
  let priority: 1 | 2 | 3 | 4 = 2; // default
  const urgentKeywords = ['urgent', 'asap', 'important', 'critical', 'deadline'];
  const highKeywords = ['please review', 'action required', 'needed by'];
  
  const emailText = (email.subject + ' ' + email.body).toLowerCase();
  
  if (urgentKeywords.some(keyword => emailText.includes(keyword))) {
    priority = 4;
  } else if (highKeywords.some(keyword => emailText.includes(keyword))) {
    priority = 3;
  }

  // Extract due date hints
  const dueDateHints = extractDueDateFromText(emailText);
  
  const taskData: TaskData = {
    title: cleanSubject.length > 0 
      ? `${cleanSubject} (from ${senderName})`
      : `Email from ${senderName}`,
    description: `${email.snippet}\n\nFrom: ${email.from}\nReceived: ${new Date(email.timestamp).toLocaleString()}`,
    priority,
    dueDate: dueDateHints,
    labels: ['email-todo']
  };

  return await createTask(taskData);
};

// Get all Todoist projects
export const getProjects = async (): Promise<Array<{id: string, name: string}>> => {
  try {
    const todoistAccount = await getActiveTodoistAccount();
    if (!todoistAccount) {
      return [];
    }

    const result = await executeAction('TODOIST_GET_ALL_PROJECTS', {
      connectedAccountId: todoistAccount.id,
      arguments: {}
    });

    if (!result.data || !result.data.projects) {
      return [];
    }

    return result.data.projects.map((project: any) => ({
      id: project.id,
      name: project.name
    }));

  } catch (error) {
    console.error('❌ Failed to get projects:', error);
    return [];
  }
};

// Helper function to extract due date from email text
const extractDueDateFromText = (text: string): string | undefined => {
  const patterns = [
    { regex: /by\s+(today|tomorrow)/i, value: (match: string) => match.split(' ')[1] },
    { regex: /due\s+(today|tomorrow)/i, value: (match: string) => match.split(' ')[1] },
    { regex: /by\s+end\s+of\s+(day|week)/i, value: (match: string) => `end of ${match.split(' ').slice(-1)[0]}` },
    { regex: /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, value: (match: string) => match.split(' ')[1] },
    { regex: /next\s+(week|month)/i, value: (match: string) => match },
    { regex: /this\s+(week|month)/i, value: (match: string) => match }
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      return pattern.value(match[0]);
    }
  }

  return undefined;
};