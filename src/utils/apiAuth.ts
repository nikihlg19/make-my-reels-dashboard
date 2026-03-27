/**
 * Shared API authentication + authorization helper.
 * Verifies Clerk JWT and checks admin role via VITE_ADMIN_EMAILS.
 */

export async function verifyAdmin(req: any): Promise<{ userId: string; email: string } | null> {
  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const authResult = await clerk.authenticateRequest(req, { secretKey: process.env.CLERK_SECRET_KEY });

    const userId = authResult?.toAuth()?.userId;
    if (!userId) return null;

    // Fetch user email from Clerk
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress || '';

    // Check against admin list
    const adminEmails = (process.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!adminEmails.includes(email.toLowerCase())) return null;

    return { userId, email };
  } catch {
    return null;
  }
}

export async function verifyAuth(req: any): Promise<{ userId: string } | null> {
  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const authResult = await clerk.authenticateRequest(req, { secretKey: process.env.CLERK_SECRET_KEY });
    const userId = authResult?.toAuth()?.userId;
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}
