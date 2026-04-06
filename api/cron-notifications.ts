import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || ''}`,
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

// ─── Idempotency helper ───────────────────────────────────────────────────────
async function acquireCronLock(cronName: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('cron_runs')
    .insert({ cron_name: cronName, run_date: today });
  if (error) {
    if (error.code === '23505') return false; // already ran today
    console.warn(`[${cronName}] cron_runs insert error:`, error.message);
  }
  return true;
}

function isInQuietHours(quietStart?: string, quietEnd?: string): boolean {
  if (!quietStart || !quietEnd) return false;
  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (startMin > endMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const locked = await acquireCronLock('cron-notifications');
  if (!locked) {
    console.log('[cron-notifications] already ran today — skipping');
    return res.status(200).json({ skipped: true, reason: 'already_ran_today' });
  }

  try {
    // ── Cleanup stale data older than 7 days ──────────────────────────────────
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Notifications — delete all older than 7 days
    const { error: notifCleanupErr, count: notifDeleted } = await supabase
      .from('notifications')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff7d);
    if (notifCleanupErr) console.error('[cleanup] notifications error:', notifCleanupErr.message);
    else console.log(`[cleanup] notifications deleted: ${notifDeleted ?? 0}`);

    // WhatsApp message logs — delete outbound older than 30 days
    const { error: waCleanupErr, count: waDeleted } = await supabase
      .from('whatsapp_messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff30d);
    if (waCleanupErr) console.error('[cleanup] whatsapp_messages error:', waCleanupErr.message);
    else console.log(`[cleanup] whatsapp_messages deleted: ${waDeleted ?? 0}`);

    // Assignment candidates — delete rows for resolved assignments older than 30 days
    const { error: candidatesCleanupErr, count: candidatesDeleted } = await supabase
      .from('assignment_candidates')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff30d);
    if (candidatesCleanupErr) console.error('[cleanup] assignment_candidates error:', candidatesCleanupErr.message);
    else console.log(`[cleanup] assignment_candidates deleted: ${candidatesDeleted ?? 0}`);

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

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .limit(500);

    if (subError) throw subError;

    const { data: allPrefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*');

    if (prefsError) console.error('Failed to load notification preferences:', prefsError);

    const prefsMap = new Map<string, any>();
    (allPrefs || []).forEach((p: any) => prefsMap.set(p.user_id, p));

    const userIds = [...new Set((subscriptions || []).map((s: any) => s.user_id))];

    for (const project of projects) {
      const isActive = project.status === 'To Do' || project.status === 'In Progress';

      if (isActive && project.event_date) {
        const eventDate = new Date(project.event_date);
        const diffMs = eventDate.getTime() - now.getTime();
        const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (daysDiff === 1) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid as string,
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

        if (daysDiff === 0) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            await createAndSendNotification({
              userId: uid as string,
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

      if (isActive && project.submission_deadline) {
        const deadline = new Date(project.submission_deadline);
        const deadlineDiff = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (deadlineDiff === 1) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid as string,
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

      if (isActive && project.event_date) {
        const eventDate = new Date(project.event_date);
        const daysPast = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysPast >= 1 && daysPast <= 3) {
          for (const uid of userIds) {
            const prefs = prefsMap.get(uid);
            if (isInQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) continue;
            await createAndSendNotification({
              userId: uid as string,
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

    return res.status(200).json({ message: 'Cron processed successfully', processed: notificationsSent });
  } catch (error: any) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: 'Cron processing failed' });
  }
}

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
  const typePref = params.prefs?.[params.type];
  const pushEnabled = typePref?.push !== false;
  const emailEnabled = typePref?.email === true;
  const inAppEnabled = typePref?.in_app !== false;

  const channelsSent: string[] = [];
  if (inAppEnabled) channelsSent.push('in_app');
  if (pushEnabled) channelsSent.push('push');
  if (emailEnabled) channelsSent.push('email');

  if (channelsSent.length === 0) return;

  const { data: notifData, error: dbError } = await supabase
    .from('notifications')
    .insert({
      user_id: params.userId,
      project_id: params.projectId,
      type: params.type,
      title: params.title,
      message: params.message,
      urgency: params.urgency || 'medium',
      channels_sent: channelsSent,
    })
    .select()
    .single();

  if (dbError) console.error('Failed to log notification:', dbError);

  if (pushEnabled) {
    const userSubs = params.subscriptions.filter((s: any) => s.user_id === params.userId);

    if (userSubs.length > 0) {
      const payload = JSON.stringify({
        title: params.title,
        body: params.message,
        data: { url: `/?project=${params.projectId}`, notificationId: notifData?.id },
      });

      const pushPromises = userSubs.map((sub: any) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(async (err: any) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else {
            console.error('Web push error:', err);
          }
        })
      );

      await Promise.allSettled(pushPromises);
    }
  }

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
