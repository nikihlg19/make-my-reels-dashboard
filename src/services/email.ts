export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sendNotificationEmail = async (options: EmailOptions, maxRetries = 2) => {
  if (!EMAIL_REGEX.test(options.to)) {
    throw new Error(`Invalid email address: ${options.to}`);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send email');
      }

      return await response.json();
    } catch (error) {
      lastError = error as Error;
      console.error(`Email attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
    }
  }

  throw lastError;
};
