// This service interfaces with Google Maps API client-side
// Bypasses CORS by dynamically injecting the Maps SDK instead of relying on a Vercel backend

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let mapsLoadPromise: Promise<void> | null = null;

export interface DistanceResult {
  distanceText: string;
  distanceValue: number; // in meters
  durationText: string;
  durationValue: number; // in seconds
}

import { parseLocation } from '../utils/location';

import { useCallback } from 'react';

export const useDistanceCalculator = () => {
  const getDistance = useCallback(async (origin: string, destination: string): Promise<DistanceResult | null> => {
    try {
      if (!origin || !destination) return null;

      const parsedOrigin = parseLocation(origin);
      const parsedDest = parseLocation(destination);

      const originInput = parsedOrigin.placeId ? { placeId: parsedOrigin.placeId } : parsedOrigin.address;
      const destInput = parsedDest.placeId ? { placeId: parsedDest.placeId } : parsedDest.address;

      // Dynamically load Google Maps script if not already present (singleton)
      if (!(window as any).google?.maps) {
        if (!API_KEY) {
           console.error("VITE_GOOGLE_MAPS_API_KEY is missing in environment");
           return null;
        }
        if (!mapsLoadPromise) {
          mapsLoadPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => { mapsLoadPromise = null; reject(new Error('Failed to load Google Maps')); };
            document.head.appendChild(script);
          });
        }
        await mapsLoadPromise;
      }

      // Use the client-side Maps SDK which allows CORS
      const service = new (window as any).google.maps.DistanceMatrixService();
      
      const response = await new Promise<any>((resolve, reject) => {
        service.getDistanceMatrix(
          {
            origins: [originInput],
            destinations: [destInput],
            travelMode: 'DRIVING',
          },
          (res: any, status: any) => {
            if (status === 'OK') resolve(res);
            else reject(new Error('Distance Matrix failed: ' + status));
          }
        );
      });

      if (!response.rows[0]?.elements[0] || response.rows[0].elements[0].status !== 'OK') {
        return null;
      }

      const element = response.rows[0].elements[0];
      return {
        distanceText: element.distance.text,
        distanceValue: element.distance.value,
        durationText: element.duration.text,
        durationValue: element.duration.value
      };
    } catch (error) {
      console.error("Error fetching distance via Maps JS SDK:", error);
      return null;
    }
  }, []);

  return { getDistance };
};
