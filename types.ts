
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
  aadhaar_image_url?: string;
  kyc_declaration?: boolean;
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
  requires_payment?: boolean;
  invoice_amount?: number;
  payment_status?: string;
  razorpay_link_id?: string;
  razorpay_link_url?: string;
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

export interface PendingApproval {
  id: string;
  type: 'edit' | 'delete' | 'create' | 'statusChange';
  entityType: 'project' | 'team' | 'client';
  entityId: string;
  entityTitle: string;
  changes: Record<string, { before: any; after: any }>;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

// ============================================================
// PHASE 1: ASSIGNMENT & WHATSAPP TYPES
// ============================================================

export type AssignmentStatus = 'pending' | 'wa_sent' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface ProjectAssignment {
  id: string;
  projectId: string;
  teamMemberId: string;
  roleNeeded: string;
  status: AssignmentStatus;
  whatsappMessageId?: string;
  sentAt?: string;
  respondedAt?: string;
  declineReason?: string;
  attemptNumber: number;
  assignmentGroupId: string;
  autoExpireAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface WhatsAppMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  recipientPhone: string;
  recipientType: 'team_member' | 'client';
  recipientId?: string;
  templateName?: string;
  templateParams?: Record<string, any>;
  messageType: string;
  whatsappMessageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  relatedProjectId?: string;
  relatedAssignmentId?: string;
  createdAt: string;
}

// ============================================================
// PHASE 2: CANDIDATE RANKING + AVAILABILITY TYPES
// ============================================================

export interface ScoreBreakdown {
  distance: number;
  availability: number;
  rating: number;
  workload: number;
  skills: number;
  recentDecline: number;
}

export interface AssignmentCandidate {
  id: string;
  assignmentGroupId: string;
  projectId: string;
  teamMemberId: string;
  roleNeeded: string;
  rankPosition: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  distanceKm?: number;
  isAvailable: boolean;
  wasAttempted: boolean;
  // Joined fields for UI
  memberName?: string;
  memberPhone?: string;
  memberColor?: string;
  memberAvatar?: string;
  memberLocation?: string;
}

export interface TeamAvailability {
  id: string;
  teamMemberId: string;
  unavailableFrom: string;
  unavailableTo: string;
  reason?: string;
}

// ============================================================
// PHASE 4: DAILY DIGEST TYPES
// ============================================================

export interface DigestShoot {
  projectId: string;
  projectTitle: string;
  location: string;
  teamStatus: 'all_confirmed' | 'pending' | 'unassigned';
  teamSummary: string;
}

export interface DigestPendingConfirmation {
  assignmentId: string;
  memberName: string;
  projectTitle: string;
  sentHoursAgo: number;
  expiringSoon: boolean;
}

export interface DigestQuoteFollowUp {
  projectId: string;
  projectTitle: string;
  clientName: string;
  daysSinceSent: number;
  autoFollowUpScheduled: boolean;
}

export interface AdminDigest {
  id: string;
  generatedAt: string;
  todaysShoots: DigestShoot[];
  pendingConfirmations: DigestPendingConfirmation[];
  quoteFollowUps: DigestQuoteFollowUp[];
  overdueProjects: { projectId: string; projectTitle: string; daysOverdue: number }[];
  revenueThisMonth: number;
  revenuePipeline: number;
  revenueOutstanding: number;
}
