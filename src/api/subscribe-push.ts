import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { PushSubscriptionSchema } from '../schemas';

/**
 * Handles Web Push subscriptions.
 * In a real Next.js/Express app, this would be a server-side route.
 * For this client-side Vite app, we interact directly with Supabase,
 * simulating an API handler so the structure remains professional.
 */

export async function POST(req: Request) {
  try {
    // Parse JSON manually if it's a raw Request object, or use body directly if passed a plain obj
    const body = req.json ? await req.json() : (req as any);

    if (!body.userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400 });
    }

    const subscriptionData = { ...body };

    // Validate request body
    const validatedData = PushSubscriptionSchema.parse(subscriptionData);

    if (!supabase) {
      return new Response(JSON.stringify({ error: 'Supabase client not initialized' }), { status: 500 });
    }

    // Upsert into Supabase (overwrites if user_id + endpoint already exists)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: validatedData.userId,
        endpoint: validatedData.endpoint,
        p256dh: validatedData.p256dh,
        auth: validatedData.auth,
        user_agent: validatedData.userAgent || navigator.userAgent
      }, {
        onConflict: 'user_id, endpoint'
      });

    if (error) {
      console.error('Database error saving subscription:', error);
      return new Response(JSON.stringify({ error: 'Failed to save subscription' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error: any) {
    if (error && typeof error === 'object' && ('errors' in error || 'issues' in error)) {
      return new Response(JSON.stringify({ error: 'Invalid subscription data', details: error.errors || error.issues }), { status: 400 });
    }
    
    console.error('Server error handling subscription:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
