import { z } from 'zod';

// ============================================================
// Core Entity Schemas
// ============================================================

export const ClientSchema = z.object({
  id: z.string().uuid().optional(),
  company: z.string().min(1, 'Company name is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  totalRevenue: z.number().min(0).default(0),
  isDeleted: z.boolean().default(false),
});

export const TeamMemberSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  role: z.string().min(1, 'Role is required'),
  photoUrl: z.string().url().optional().or(z.literal('')),
  rating: z.number().min(0).max(5).default(0),
  completedShoots: z.number().min(0).default(0),
  upcomingShoots: z.number().min(0).default(0),
  tags: z.array(z.string()).default([]),
  onboardingNotes: z.string().optional(),
  isDeleted: z.boolean().default(false),
});

export const FinancialsSchema = z.object({
  totalCost: z.number().min(0).optional().default(0),
  advance: z.number().min(0).optional().default(0),
  balance: z.number().min(0).optional().default(0),
  expenses: z.number().min(0).optional().default(0),
  revenue: z.number().min(0).optional().default(0),
});

export const ProjectSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Project title is required'),
  clientId: z.string().optional(),
  type: z.string().min(1, 'Project type is required'),
  status: z.enum(['Expired', 'Quote Sent', 'To Do', 'In Progress', 'Completed']).default('To Do'),
  financials: FinancialsSchema.optional(),
  teamMembers: z.array(z.object({ id: z.string() })).default([]),
  assets: z.array(z.object({ url: z.string(), tag: z.string().optional() })).default([]),
  eventDate: z.string().min(1, 'Event date is required'),
  eventTime: z.string().min(1, 'Event time is required'),
  shootLocation: z.string().optional(),
  isDeleted: z.boolean().default(false),
});

// ============================================================
// Notification Schemas
// ============================================================

export const NotificationTypeEnum = z.enum([
  'shoot_reminder_1h',
  'shoot_reminder_24h',
  'deadline_reminder',
  'overdue_alert',
  'status_change',
  'project_assigned',
  'payment_received',
]);

export const UrgencyEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const NotificationSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().min(1),
  projectId: z.string().uuid().optional(),
  type: NotificationTypeEnum,
  title: z.string().min(1),
  message: z.string().min(1),
  urgency: UrgencyEnum.default('medium'),
  isRead: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  channelsSent: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.string().datetime().optional(),
});

export const ChannelPreferenceSchema = z.object({
  push: z.boolean().default(false),
  email: z.boolean().default(false),
  in_app: z.boolean().default(true),
  telegram: z.boolean().default(true),
});

export const NotificationPreferencesSchema = z.object({
  userId: z.string().min(1),
  shoot_reminder_1h: ChannelPreferenceSchema.default({ push: true, email: false, in_app: true, telegram: true }),
  shoot_reminder_24h: ChannelPreferenceSchema.default({ push: true, email: true, in_app: true, telegram: true }),
  deadline_reminder: ChannelPreferenceSchema.default({ push: true, email: true, in_app: true, telegram: true }),
  status_change: ChannelPreferenceSchema.default({ push: false, email: false, in_app: true, telegram: false }),
  project_assigned: ChannelPreferenceSchema.default({ push: true, email: true, in_app: true, telegram: true }),
  overdue_alert: ChannelPreferenceSchema.default({ push: true, email: true, in_app: true, telegram: true }),
  payment_received: ChannelPreferenceSchema.default({ push: true, email: false, in_app: true, telegram: true }),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
});

export const PushSubscriptionSchema = z.object({
  userId: z.string().min(1),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

// ============================================================
// Inferred Types (use these instead of manual interfaces)
// ============================================================
export type ClientInput = z.infer<typeof ClientSchema>;
export type TeamMemberInput = z.infer<typeof TeamMemberSchema>;
export type ProjectInput = z.infer<typeof ProjectSchema>;
export type NotificationType = z.infer<typeof NotificationTypeEnum>;
export type Urgency = z.infer<typeof UrgencyEnum>;
export type Notification = z.infer<typeof NotificationSchema>;
export type ChannelPreference = z.infer<typeof ChannelPreferenceSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type PushSubscription = z.infer<typeof PushSubscriptionSchema>;
