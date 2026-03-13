export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendNotificationEmail = async (options: EmailOptions) => {
  try {
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
    console.error("Email notification failed:", error);
    throw error;
  }
};
