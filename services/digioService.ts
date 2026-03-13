import { TeamMember } from '../types';

const DIGIO_API_URL = 'https://api.digio.in/v2/client/kyc/aadhaar/initiate';

export const initiateDigioKYC = async (aadhaar: string) => {
  const apiKey = import.meta.env.VITE_DIGIO_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_DIGIO_API_KEY is not configured');
  }

  const response = await fetch(DIGIO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      aadhaar_number: aadhaar,
      // Add other required fields based on Digio API documentation
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to initiate Digio KYC');
  }

  return await response.json();
};
