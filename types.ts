
export type Priority = 'High' | 'Medium' | 'Low';
export type ProjectStatus = 'Expired' | 'Quote Sent' | 'To Do' | 'In Progress' | 'Completed';

export interface Client {
  id: string;
  name: string;
  company: string;
  email?: string;
  phone: string;
  location?: string;
  notes?: string;
  avatar: string;
  color: string;
  createdAt: string;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string | string[];
  phone: string;
  location?: string;
  avatar: string;
  color: string; // Added for unique avatar colors
  activeProjects: number;
  completedProjects: number;
  avgRating: number;
  avgEffort: number;
  onTimeRate: number;
  tags?: string[]; // New field
  onboardingNotes?: string;
  updatedAt?: number;
  kyc_status?: 'none' | 'manual' | 'digio_verified';
  kyc_aadhaar?: string;
  kyc_aadhaar_image?: string;
  kyc_id_type?: string;
  kyc_id_number?: string;
  kyc_declaration?: boolean;
  kyc_digio_ref?: string;
  isDeleted?: boolean;
}

export interface InstaLink {
  url: string;
  tag: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  notes?: string;
  location: string;
  priority: Priority;
  tags: string[];
  teamMemberIds: string[];
  clientId?: string; // Link to a client (Legacy)
  clientIds?: string[]; // Link to multiple clients
  eventDate: string; // The date of the actual shoot/event
  eventTime?: string; // The scheduled time for the event
  submissionDeadline?: string; // The date the final video is due (optional)
  dueDate: string; // Internal target date
  status: ProjectStatus;
  progress: number;
  isOverdue?: boolean;
  instaLinks?: InstaLink[];
  budget?: number;
  expenses?: number;
  rating?: number;
  updatedAt?: number;
  dependencies?: string[];
  isDeleted?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'project' | 'meeting' | 'shoot';
  projectId?: string;
}

export interface Financials {
  budget: number;
  expenses: number;
  profit: number;
}
