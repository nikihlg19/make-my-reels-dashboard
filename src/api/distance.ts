import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../utils/rateLimit';
import { validateQuery } from '../utils/validateRequest';
import { DistanceQuerySchema } from '../schemas';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Normalize a location string for cache key consistency */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Authenticate Request securely using Clerk
  let userId = 'anonymous';
  try {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const authResult = await clerkClient.authenticateRequest(req, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    userId = (authResult as any)?.toAuth?.()?.userId || 'authenticated';
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  // Rate limit: 30 requests per minute
  const allowed = await checkRateLimit(userId, 'distance', 30, 60);
  if (!allowed) {
    return res.status(429).json({ message: 'Too many requests. Please wait a moment.' });
  }

  const { origin, destination } = req.query;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ message: 'Server missing Google Maps API key' });
  }

  const validated = validateQuery(DistanceQuerySchema, req, res);
  if (!validated) return; // 400 already sent

  const normOrigin = normalize(origin);
  const normDest = normalize(destination);

  // Check cache (7-day TTL)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabaseAdmin
    .from('distance_cache')
    .select('result')
    .eq('origin', normOrigin)
    .eq('destination', normDest)
    .gte('created_at', sevenDaysAgo)
    .limit(1)
    .single();

  if (cached?.result) {
    return res.status(200).json(cached.result);
  }

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`);
    const data = await response.json();

    if (data.status === 'OK' && data.rows && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      const result = {
        distanceText: element.distance.text,
        distanceValue: element.distance.value,
        durationText: element.duration.text,
        durationValue: element.duration.value,
      };

      // Cache the result (upsert on origin+destination)
      await supabaseAdmin
        .from('distance_cache')
        .upsert(
          { origin: normOrigin, destination: normDest, result, created_at: new Date().toISOString() },
          { onConflict: 'origin,destination' }
        );

      return res.status(200).json(result);
    }

    return res.status(400).json({ message: 'Could not calculate distance', data });
  } catch (error: any) {
    return res.status(500).json({ message: 'Distance calculation failed' });
  }
}
