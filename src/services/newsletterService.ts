import { db } from "./firebase";
import { collection, serverTimestamp, doc, setDoc } from "firebase/firestore";

export async function saveSubscriber(email: string, source: "footer" | "landing" | "popup" = "footer") {
  // Upsert by normalized email to avoid duplicates
  const normalized = String(email).trim().toLowerCase();
  const ref = doc(collection(db, "subscribers"), normalized);
  await setDoc(
    ref,
    {
      email: normalized,
      source,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Save/update FCM token per email (or anonymous)
export async function savePushToken(token: string, email?: string) {
  // Use token as document id for easy upsert
  const ref = doc(collection(db, "pushTokens"), token);
  await setDoc(ref, {
    token,
    email: email || null,
    createdAt: serverTimestamp(),
    active: true,
  }, { merge: true });
}