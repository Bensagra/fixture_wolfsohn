import { savePushSubscription } from "./supabase";

// This key is intentionally public and must match the private VAPID key configured
// only in the Supabase Edge Function.
const DEFAULT_VAPID_PUBLIC_KEY =
  "BPU8R39c2tDj-B5f3prSiS-Gr7q1XuJRqpyBub-5m8k3tSrOrg35NUKWReieW0jzPdJUlyfIVvpWYKSLHqr9Ji0";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function notificationsSupported() {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export async function enableTeamNotifications(tournamentId: string, teamId: string) {
  if (!notificationsSupported()) throw new Error("Este dispositivo no soporta notificaciones.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No se otorgó permiso para notificaciones.");
  const registration = await navigator.serviceWorker.ready;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }));
  await savePushSubscription(tournamentId, teamId, subscription);
  return subscription;
}
