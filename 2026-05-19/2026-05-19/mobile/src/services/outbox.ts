import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/client';

// Generic OUTBOX for "submit and forget" actions that post directly to the API
// (product feedback, sampling, broadcast initiative, ageing/near-expiry, etc.).
// On submit a screen enqueues the request and shows success IMMEDIATELY; this
// service posts it to the server in the background and retries until it lands,
// so the user never waits on the network or sees a false "offline" error.
//
// WatermelonDB-backed actions (orders, stocks, visits, OSOI, PO capture) already
// work this way via pushSync — the outbox is only for the direct-API submissions
// that used to await a blocking axios POST.

export interface OutboxPhoto {
  /** Local file:// path of the (already watermarked) photo to upload. */
  localPath: string;
  /** Payload field that receives the uploaded server URL (e.g. 'imagePath'). */
  field: string;
  /** Upload category/folder (e.g. 'product-feedback'). */
  category: string;
}

export interface OutboxItem {
  id: string;
  endpoint: string;            // e.g. '/product-feedback'
  payload: Record<string, any>;
  photo?: OutboxPhoto;         // optional photo to upload before posting
  createdAt: number;
  attempts: number;
}

// Scope the queue per user so one rep's queued submission is never posted under
// another rep's token after a user switch.
function keyFor(): string {
  try {
    const code = require('../store/auth').default.getState().user?.code ?? 'anon';
    return `app_outbox_${code}`;
  } catch {
    return 'app_outbox_anon';
  }
}

let flushing = false;

/** Enqueue a submission and kick off a background flush. Returns immediately. */
export async function enqueueOutbox(item: { endpoint: string; payload: Record<string, any>; photo?: OutboxPhoto }): Promise<void> {
  const key = keyFor();
  try {
    const raw = await AsyncStorage.getItem(key);
    const queue: OutboxItem[] = raw ? JSON.parse(raw) : [];
    queue.push({
      ...item,
      id: `${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
      createdAt: Date.now(),
      attempts: 0,
    });
    await AsyncStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {
    console.warn('[Outbox] enqueue failed:', e);
  }
  // Fire-and-forget immediate attempt so it posts right away when online.
  flushOutbox().catch(() => { /* will retry from the background flush */ });
}

/** Process the queue: upload any photo, POST, drop on success/permanent error. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  const key = keyFor();
  try {
    const raw = await AsyncStorage.getItem(key);
    const queue: OutboxItem[] = raw ? JSON.parse(raw) : [];
    if (!queue.length) return;

    const remaining: OutboxItem[] = [];
    for (const item of queue) {
      try {
        const payload = { ...item.payload };
        if (item.photo?.localPath && !payload[item.photo.field]) {
          try {
            const { uploadPhoto } = require('./syncService');
            const url = await uploadPhoto(item.photo.localPath, item.photo.category);
            if (url) payload[item.photo.field] = url;
          } catch {
            // Photo upload is best-effort — post without it rather than block the
            // record forever on a flaky upload.
          }
        }
        await apiClient.post(item.endpoint, payload);
        // success → drop the item
      } catch (e: any) {
        const status = e?.response?.status;
        // Permanent client-side rejection (validation/conflict) — drop so it
        // doesn't retry forever. Network errors, timeouts, 5xx and 429 retry.
        const permanent = !!status && status >= 400 && status < 500 && status !== 408 && status !== 429;
        const tooMany = (item.attempts ?? 0) >= 100;
        if (permanent || tooMany) {
          console.warn('[Outbox] dropping item', item.endpoint, status ?? '(no status)', 'attempts', item.attempts);
        } else {
          remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 });
        }
      }
    }
    await AsyncStorage.setItem(key, JSON.stringify(remaining));
  } catch (e) {
    console.warn('[Outbox] flush failed:', e);
  } finally {
    flushing = false;
  }
}

/** Number of items still waiting to post (for an optional pending badge). */
export async function outboxCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(keyFor());
    return raw ? (JSON.parse(raw) as OutboxItem[]).length : 0;
  } catch {
    return 0;
  }
}
