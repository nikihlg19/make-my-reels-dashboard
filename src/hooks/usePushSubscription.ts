import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { toast } from 'sonner';

/**
 * Hook to manage the Web Push subscription flow.
 * Checks support, requests permission, generates subscription, and sends to backend.
 */
export function usePushSubscription() {
  const { getToken } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(true);

  // VAPID public key from backend/env
  const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  const urlB64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const checkSubscription = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      setIsSupported(true);
      setPermissionState(Notification.permission);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = async (userId?: string) => {
    try {
      setIsLoading(true);

      if (!userId) {
        throw new Error('User ID is required to subscribe to push notifications.');
      }

      if (!PUBLIC_KEY) {
        throw new Error('VAPID public key not found. Check environment variables.');
      }

      if (Notification.permission === 'default') {
        toast('Please click "Allow" on the browser prompt to receive job alerts.', { duration: 5000, icon: '🔔' });
      }

      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== 'granted') {
        toast.error('You need to grant permission to receive notifications.');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const convertedVapidKey = urlB64ToUint8Array(PUBLIC_KEY);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Extract keys
      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');

      if (!p256dh || !auth) throw new Error('Failed to extract subscription keys');

      const subscriptionData = {
        userId,
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
        userAgent: navigator.userAgent
      };

      const jwt = await getToken({ template: 'supabase' });
      const response = await fetch('/api/subscribe-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(subscriptionData),
      });

      if (!response.ok) {
        throw new Error('Server failed to save subscription');
      }

      setIsSubscribed(true);
      toast.success('Successfully subscribed to notifications!');
      return true;

    } catch (error) {
      console.error('Subscription error:', error);
      toast.error('Failed to subscribe: ' + (error as Error).message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    isSubscribed,
    permissionState,
    isLoading,
    subscribe,
    checkSubscription
  };
}
