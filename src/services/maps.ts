// This service interfaces with Google Maps API
// Used for Geocoding (Text to Coordinates) and Distance Matrix (Travel Time)

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export interface DistanceResult {
  distanceText: string;
  distanceValue: number; // in meters
  durationText: string;
  durationValue: number; // in seconds
}

export const getDistance = async (origin: string, destination: string): Promise<DistanceResult | null> => {
  if (!API_KEY) {
    console.warn("Google Maps API Key is missing. Returning null distance.");
    return null;
  }
  
  // Note: Client-side calls to Google Maps REST APIs often face CORS issues if not properly restricted/proxied.
  // In a production Vercel app, this should ideally be an API route (/api/distance) using the GOOGLE_MAPS_SERVER_KEY.
  // For now, we simulate the structure.
  
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${API_KEY}`);
    const data = await response.json();
    
    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const element = data.rows[0].elements[0];
      return {
        distanceText: element.distance.text,
        distanceValue: element.distance.value,
        durationText: element.duration.text,
        durationValue: element.duration.value,
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching distance:", error);
    return null;
  }
};
