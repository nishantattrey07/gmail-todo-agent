// Simple types for Gmail-Todo agent
export interface EmailData {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  snippet: string;
  labelIds: string[];
  threadId: string;
  timestamp: Date;
}

export interface TaskData {
  title: string;
  description?: string;
  priority: 1 | 2 | 3 | 4;
  dueDate?: string;
  projectId?: string;
  labels?: string[];
}

export interface ProcessingResult {
  success: boolean;
  emailId: string;
  taskId?: string;
  error?: string;
  timestamp: string;
}

export interface ConnectedAccount {
  id: string;
  toolkit: string;
  status: 'ACTIVE' | 'INACTIVE' | 'NEEDS_REAUTH';
  userId: string;
}

export interface Logger {
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
  debug: (message: string, meta?: any) => void;
}