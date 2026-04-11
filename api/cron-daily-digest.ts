import { createClient } from '@supabase/supabase-js';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Idempotency helper ───────────────────────────────────────────────────────
async function acquireCronLock(cronName: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabaseAdmin
    .from('cron_runs')
    .insert({ cron_name: cronName, run_date: today });
  if (error) {
    if (error.code === '23505') return false; // already ran today
    console.warn(`[${cronName}] cron_runs insert error:`, error.message);
  }
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const locked = await acquireCronLock('cron-daily-digest');
  if (!locked) {
    console.log('[cron-daily-digest] already ran today — skipping');
    return res.status(200).json({ skipped: true, reason: 'already_ran_today' });
  }

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  const { data: todaysShoots } = await supabaseAdmin
    .from('projects')
    .select('id, title, location, event_date, event_time, client_name, status, team_members')
    .eq('event_date', todayStr)
    .order('event_time', { ascending: true });

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { data: pendingConfirmations } = await supabaseAdmin
    .from('project_assignments')
    .select('id, project_id, team_member_id, role_needed, sent_at, projects(title), team_members(name, phone)')
    .eq('status', 'wa_sent')
    .lt('sent_at', oneHourAgo)
    .order('sent_at', { ascending: true });

  const twoDaysAgo = subDays(now, 2).toISOString();
  const { data: quoteFollowUps } = await supabaseAdmin
    .from('projects')
    .select('id, title, client_name, created_at, status')
    .eq('status', 'quote_sent')
    .lt('created_at', twoDaysAgo)
    .order('created_at', { ascending: true });

  const { data: overdueProjects } = await supabaseAdmin
    .from('projects')
    .select('id, title, client_name, event_date, status')
    .lt('event_date', todayStr)
    .not('status', 'in', '("completed","cancelled","delivered")')
    .order('event_date', { ascending: true });

  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  const { data: monthProjects } = await supabaseAdmin
    .from('projects')
    .select('total_amount, amount_paid, status')
    .gte('event_date', monthStart);

  let revenueThisMonth = 0;
  let revenuePipeline = 0;
  let revenueOutstanding = 0;

  for (const p of monthProjects || []) {
    const total = Number(p.total_amount) || 0;
    const paid = Number(p.amount_paid) || 0;
    if (['completed', 'delivered'].includes(p.status)) {
      revenueThisMonth += paid;
      revenueOutstanding += total - paid;
    } else {
      revenuePipeline += total;
    }
  }

  const { data: digest, error: insertError } = await supabaseAdmin
    .from('admin_digests')
    .insert({
      generated_at: now.toISOString(),
      todays_shoots: todaysShoots || [],
      pending_confirmations: pendingConfirmations || [],
      quote_follow_ups: quoteFollowUps || [],
      overdue_projects: overdueProjects || [],
      revenue_this_month: revenueThisMonth,
      revenue_pipeline: revenuePipeline,
      revenue_outstanding: revenueOutstanding,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[cron-daily-digest] insert error:', insertError);
    return res.status(500).json({ error: 'Failed to save digest' });
  }

  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id, telegram_chat_id');
  const adminUserIds = (prefs || []).map((p: any) => p.user_id);

  const todayShootCount = (todaysShoots || []).length;
  const pendingCount = (pendingConfirmations || []).length;
  const overdueCount = (overdueProjects || []).length;

  const summaryLines: string[] = [];
  if (todayShootCount > 0) summaryLines.push(`📸 ${todayShootCount} shoot${todayShootCount > 1 ? 's' : ''} today`);
  if (pendingCount > 0) summaryLines.push(`⏳ ${pendingCount} pending team confirmation${pendingCount > 1 ? 's' : ''}`);
  if (overdueCount > 0) summaryLines.push(`🚨 ${overdueCount} overdue project${overdueCount > 1 ? 's' : ''}`);
  if ((quoteFollowUps || []).length > 0) summaryLines.push(`💬 ${quoteFollowUps!.length} quote${quoteFollowUps!.length > 1 ? 's' : ''} need follow-up`);

  if (adminUserIds.length > 0) {
    await supabaseAdmin.from('notifications').insert(
      adminUserIds.map((userId: string) => ({
        user_id: userId,
        type: 'daily_digest',
        title: `Good morning! Daily briefing for ${format(now, 'd MMM')}`,
        message: summaryLines.length > 0
          ? summaryLines.join(' · ')
          : 'All clear — no urgent actions today.',
        urgency: overdueCount > 0 || pendingCount > 0 ? 'high' : 'low',
      }))
    );
  }

  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
  if (adminPhone && process.env.WHATSAPP_BSP_API_KEY) {
    try {
      const waBody = {
        countryCode: '91',
        phoneNumber: adminPhone.replace(/^(\+91|91)/, ''),
        callbackData: 'daily_digest',
        type: 'Template',
        template: {
          name: 'daily_admin_digest',
          languageCode: 'en',
          bodyValues: [
            format(now, 'd MMM yyyy'),
            String(todayShootCount),
            String(pendingCount),
            String(overdueCount),
            `₹${(revenueThisMonth / 1000).toFixed(1)}k`,
          ],
        },
      };

      await fetch(process.env.WHATSAPP_BSP_API_URL || 'https://api.interakt.ai/v1/public/message/', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${process.env.WHATSAPP_BSP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waBody),
      });
    } catch (e) {
      console.warn('[cron-daily-digest] WhatsApp send failed (non-fatal):', e);
    }
  }

  // ── Telegram digest (admin users only) ───────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    // Only send to users who are in adminUserIds AND have telegram linked
    const telegramAdmins = (prefs || []).filter(
      (p: any) => p.telegram_chat_id && adminUserIds.includes(p.user_id)
    );
    if (telegramAdmins.length > 0) {
      const digestLines = [
        `<b>Good morning! Daily briefing for ${format(now, 'd MMM')}</b>`,
        '',
        ...(summaryLines.length > 0 ? summaryLines : ['All clear — no urgent actions today.']),
        '',
        `Revenue this month: ${(revenueThisMonth / 1000).toFixed(1)}k`,
      ];
      const telegramText = digestLines.join('\n');

      for (const u of telegramAdmins) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: u.telegram_chat_id, text: telegramText, parse_mode: 'HTML' }),
          });
        } catch (e) {
          console.warn('[cron-daily-digest] Telegram send failed:', (e as any)?.message);
        }
      }
    }
  }

  console.log(`[cron-daily-digest] done — shoots:${todayShootCount} pending:${pendingCount} overdue:${overdueCount}`);

  return res.status(200).json({
    digestId: digest?.id,
    todayShoots: todayShootCount,
    pendingConfirmations: pendingCount,
    overdueProjects: overdueCount,
    revenueThisMonth,
  });
}
