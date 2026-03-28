import { verifyToken } from '@clerk/backend';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  const { origin, destination } = req.query;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ message: 'Server missing Google Maps API key' });
  }

  if (!origin || !destination) {
    return res.status(400).json({ message: 'Origin and destination are required' });
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.rows && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      return res.status(200).json({
        distanceText: element.distance.text,
        distanceValue: element.distance.value,
        durationText: element.duration.text,
        durationValue: element.duration.value,
      });
    }

    return res.status(400).json({ message: 'Could not calculate distance', data });
  } catch (error: any) {
    return res.status(500).json({ message: 'Distance calculation failed' });
  }
}
