import { createClerkClient } from '@clerk/backend';
import { validateBody } from '../utils/validateRequest';
import { CreateOrderSchema } from '../schemas';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Authenticate Request
  try {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
    
    await clerkClient.authenticateRequest(req, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  const validated = validateBody(CreateOrderSchema, req, res);
  if (!validated) return;
  const { amount, currency = 'INR' } = validated;
  const receipt = req.body.receipt || 'receipt_1';

  const key_id = process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    return res.status(500).json({ message: 'Server missing Razorpay credentials' });
  }

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${key_id}:${key_secret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Convert to paise
        currency,
        receipt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.description || 'Razorpay order creation failed');
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ message: 'Order creation failed' });
  }
}
