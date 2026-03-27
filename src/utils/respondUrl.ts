/**
 * Builds secure accept/decline URLs for assignment responses.
 * Optionally shortens them via TinyURL (no API key required).
 */

const APP_URL = process.env.VITE_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

export function buildRespondUrl(assignmentId: string, action: 'accept' | 'decline', token: string): string {
  return `${APP_URL}/api/assignment/respond?id=${encodeURIComponent(assignmentId)}&action=${action}&token=${encodeURIComponent(token)}`;
}

/**
 * Shortens a URL via TinyURL's free API (no login or API key needed).
 * Falls back to the original URL silently if shortening fails.
 */
async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return longUrl;
    const short = await res.text();
    // Validate it looks like a tinyurl before trusting it
    return short.startsWith('https://tinyurl.com/') ? short.trim() : longUrl;
  } catch {
    return longUrl;
  }
}

/**
 * Builds and shortens both accept and decline URLs in parallel.
 * Always resolves — falls back to long URLs if TinyURL is unavailable.
 */
export async function buildShortRespondUrls(
  assignmentId: string,
  token: string,
): Promise<{ acceptUrl: string; declineUrl: string }> {
  const acceptLong = buildRespondUrl(assignmentId, 'accept', token);
  const declineLong = buildRespondUrl(assignmentId, 'decline', token);

  const [acceptUrl, declineUrl] = await Promise.all([
    shortenUrl(acceptLong),
    shortenUrl(declineLong),
  ]);

  return { acceptUrl, declineUrl };
}
