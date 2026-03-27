/**
 * Builds a secure accept/decline URL for assignment responses.
 * Used by both create.ts and autoCascade.ts.
 */

const APP_URL = process.env.VITE_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

export function buildRespondUrl(assignmentId: string, action: 'accept' | 'decline', token: string): string {
  return `${APP_URL}/api/assignment/respond?id=${encodeURIComponent(assignmentId)}&action=${action}&token=${encodeURIComponent(token)}`;
}
