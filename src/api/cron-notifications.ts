import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configure Web Push with VAPID keys
// In production, these MUST be set in your Vercel/Node environment
webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || ''}`,
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

/**
 * Check if current time falls within a user's quiet hours.
 * Returns true if notifications should be suppressed.
 */
function isInQuietHours(quietStart?: string, quietEnd?: string): boolean {
  if (!quietStart || !quietEnd) return false;

  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  // Handle overnight ranges (e.g., 22:00 to 08:00)
  if (startMin > endMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
}

/**
 * Vercel Cron Endpoint: /api/cron-notifications
 * Runs periodically to check for upcoming shoots, deadlines, and overdue projects.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth header from Vercel CRON to prevent public execution (fail-closed)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch all active projects (not just To Do/In Progress)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('is_deleted', false);

    if (projectsError) throw projectsError;
    if (!projects || projects.length === 0) {
      return res.status(200).json({ message: 'No projects found', processed: 0 });
    }

    const now = new Date();
    let notificationsSent = 0;

    // 2. Fetch all push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subError) throw subError;

    // 3. Fetch all notification preferences (for quiet hours + channel prefs)
    const { data: allPrefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*');

    if (prefsError) console.error('Failed to load notification preferences:', prefsError);

    const prefsMap = new Map<string, any>();
    (allPrefs || []).forEach(p => prefsMap.set(p.user_id, p));

    // 4. Get unique user IDs from subscriptions
    const userIds = [...new Set((subscriptions || []).map(s => s.user_id))];

    // 5. Process each project
    for (const project of projects) {
      const isActive = project.status === 'To Do' || project.status === 'In Progress';

      // --- Shoot Reminders (only for active projects with event_date) ---
      if (isActive && project.event_date) {
        const eventDate = new Date(project.event_date);
        const diffMs = eventDate.getTime() - now.getTime();
        const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // 24 Hour Reminder
        if (daysDiff === 1) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid,
              projectId: project.id,
              type: 'shoot_reminder_24h',
              title: 'Upcoming Shoot Tomorrow',
              message: `${project.title} is scheduled for tomorrow. Ensure team is ready.`,
              subscriptions: subscriptions || [],
              prefs,
            });
            notificationsSent++;
          }
        }

        // Same-day Reminder
        if (daysDiff === 0) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            // Don't suppress urgent same-day reminders during quiet hours
            await createAndSendNotification({
              userId: uid,
              projectId: project.id,
              type: 'shoot_reminder_1h',
              title: 'Shoot Starting Soon',
              message: `${project.title} is scheduled for today. Final checks required.`,
              urgency: 'high',
              subscriptions: subscriptions || [],
              prefs,
            });
            notificationsSent++;
          }
        }
      }

      // --- Deadline Reminders (active projects with submission_deadline) ---
      if (isActive && project.submission_deadline) {
        const deadline = new Date(project.submission_deadline);
        const deadlineDiff = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (deadlineDiff === 1) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid,
              projectId: project.id,
              type: 'deadline_reminder',
              title: 'Deadline Tomorrow',
              message: `${project.title} submission deadline is tomorrow. Finalize deliverables.`,
              urgency: 'high',
              subscriptions: subscriptions || [],
              prefs,
            });
            notificationsSent++;
          }
        }
      }

      // --- Overdue Alert (active projects past their event_date) ---
      if (isActive && project.event_date) {
        const eventDate = new Date(project.event_date);
        const daysPast = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysPast >= 1 && daysPast <= 3) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid,
              projectId: project.id,
              type: 'overdue_alert',
              title: 'Project Overdue',
              message: `${project.title} is ${daysPast} day(s) past its scheduled date and still ${project.status}.`,
              urgency: 'high',
              subscriptions: subscriptions || [],
              prefs,
            });
            notificationsSent++;
          }
        }
      }
    }

    return res.status(200).json({
      message: 'Cron processed successfully',
      processed: notificationsSent
    });

  } catch (error: any) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: 'Cron processing failed' });
  }
}

/**
 * Helper to record notification in DB and send Web Push to the specific user.
 * Respects per-user channel preferences.
 */
async function createAndSendNotification(params: {
  userId: string;
  projectId: string;
  type: string;
  title: string;
  message: string;
  urgency?: string;
  subscriptions: any[];
  prefs?: any;
}) {
  // Check per-user channel preferences for this notification type
  const typePref = params.prefs?.[params.type];
  const pushEnabled = typePref?.push !== false; // default true if no prefs
  const emailEnabled = typePref?.email === true;
  const inAppEnabled = typePref?.in_app !== false; // default true

  const channelsSent: string[] = [];
  if (inAppEnabled) channelsSent.push('in_app');
  if (pushEnabled) channelsSent.push('push');
  if (emailEnabled) channelsSent.push('email');

  if (channelsSent.length === 0) return; // User disabled all channels for this type

  // 1. Insert into Database (in-app notification)
  const { data: notifData, error: dbError } = await supabase
    .from('notifications')
    .insert({
      user_id: params.userId,
      project_id: params.projectId,
      type: params.type,
      title: params.title,
      message: params.message,
      urgency: params.urgency || 'medium',
      channels_sent: channelsSent
    })
    .select()
    .single();

  if (dbError) {
    console.error('Failed to log notification:', dbError);
  }

  // 2. Send Web Push to this user's subscriptions
  if (pushEnabled) {
    const userSubs = params.subscriptions.filter(s => s.user_id === params.userId);

    if (userSubs.length > 0) {
      const payload = JSON.stringify({
        title: params.title,
        body: params.message,
        data: {
          url: `/?project=${params.projectId}`,
          notificationId: notifData?.id
        }
      });

      const pushPromises = userSubs.map(sub => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        return webPush.sendNotification(pushSubscription, payload)
          .catch(async (err) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log('Subscription expired, removing:', sub.endpoint);
              if (supabase) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
              }
            } else {
              console.error('Web push error:', err);
            }
          });
      });

      await Promise.allSettled(pushPromises);
    }
  }

  // 3. Send email if enabled (uses send-email API with cron secret)
  if (emailEnabled) {
    try {
      const emailEndpoint = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/send-email`
        : '/api/send-email';

      const templateMap: Record<string, string> = {
        shoot_reminder_1h: 'shoot_reminder',
        shoot_reminder_24h: 'shoot_reminder',
        deadline_reminder: 'deadline_reminder',
      };

      const template = templateMap[params.type];
      if (template) {
        await fetch(emailEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.CRON_SECRET || '',
          },
          body: JSON.stringify({
            to: process.env.VITE_ADMIN_EMAILS || 'admin@makemyreels.in',
            subject: params.title,
            template,
            templateData: {
              projectTitle: params.title,
              date: new Date().toLocaleDateString('en-IN'),
              time: new Date().toLocaleTimeString('en-IN'),
            },
          }),
        });
      }
    } catch (emailErr) {
      console.error('Failed to send email notification:', emailErr);
    }
  }
}
