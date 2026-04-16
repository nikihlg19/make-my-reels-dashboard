import { createClerkClient } from '@clerk/backend';
import { checkRateLimit } from '../utils/rateLimit';
import { validateBody } from '../utils/validateRequest';
import { SendEmailSchema } from '../schemas';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Auth: accept either CRON_SECRET or Clerk JWT
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const isCron = cronSecret && (
    req.headers['x-cron-secret'] === cronSecret ||
    authHeader === `Bearer ${cronSecret}`
  );

  if (!isCron) {
    try {
      const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      await clerkClient.authenticateRequest(req, { secretKey: process.env.CLERK_SECRET_KEY });
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Rate limit: 10 emails per hour for non-cron callers
    const allowed = await checkRateLimit('user', 'send-email', 10, 3600);
    if (!allowed) {
      return res.status(429).json({ message: 'Email rate limit exceeded. Try again later.' });
    }
  }

  const validated = validateBody(SendEmailSchema, req, res);
  if (!validated) return;
  const { to, subject, html, template, templateData } = validated;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ message: 'Server missing Resend API key' });
  }

  // Escape HTML entities to prevent XSS in email templates
  const escapeHtml = (str: string) =>
    String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let finalHtml = html;

  // Support for predefined email templates
  if (template === 'shoot_reminder') {
    finalHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f46e5;">Shoot Reminder: ${escapeHtml(templateData?.projectTitle)}</h2>
        <p><strong>Date:</strong> ${escapeHtml(templateData?.date)}</p>
        <p><strong>Time:</strong> ${escapeHtml(templateData?.time)}</p>
        ${templateData?.location ? `<p><strong>Location:</strong> ${escapeHtml(templateData.location)}</p>` : ''}
        <br/>
        <p>Please ensure all equipment is prepped and you arrive 15 minutes early.</p>
        <p>— MMR Studio Team</p>
      </div>
    `;
  } else if (template === 'deadline_reminder') {
    finalHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #e11d48;">Deadline Approaching: ${escapeHtml(templateData?.projectTitle)}</h2>
        <p>The submission deadline for <strong>${escapeHtml(templateData?.projectTitle)}</strong> is tomorrow.</p>
        <p>Please ensure all final exports and client deliverables are uploaded to the drive.</p>
      </div>
    `;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${process.env.VITE_COMPANY_NAME || 'Make My Reels'} <${process.env.VITE_NOTIFICATION_FROM_EMAIL || 'notifications@makemyreels.in'}>`,
        to,
        subject,
        html: finalHtml,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Resend email failed');
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ message: 'Email sending failed' });
  }
}
