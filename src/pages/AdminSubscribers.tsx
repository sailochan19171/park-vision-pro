import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../services/firebase";

interface Subscriber {
  id: string;
  email: string;
  source?: string;
  active?: boolean;
  createdAt?: Timestamp | null;
}

const formatDate = (ts?: Timestamp | null) => {
  try {
    if (!ts) return "—";
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return "—";
  }
};

export default function AdminSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  useEffect(() => {
    // Live updates from Firestore
    const q = query(collection(db, "subscribers"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: Subscriber[] = snap.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          email: data.email || "",
          source: data.source || "unknown",
          active: data.active ?? true,
          createdAt: (data.createdAt as Timestamp) || null,
        };
      });
      setSubscribers(rows);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return subscribers.filter((r) => {
      if (onlyActive && r.active === false) return false;
      if (!s) return true;
      return (
        r.email.toLowerCase().includes(s) ||
        (r.source || "").toLowerCase().includes(s)
      );
    });
  }, [subscribers, search, onlyActive]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Newsletter Subscribers</h1>
            <p className="text-sm text-gray-600">Live updates via Firestore onSnapshot</p>
          </div>
          <div className="text-right">
            <div className="text-sm">Total: <span className="font-semibold">{subscribers.length}</span></div>
            <div className="text-sm">Showing: <span className="font-semibold">{filtered.length}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or source..."
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="inline-flex items-center space-x-2 md:col-span-1">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            <span className="text-sm">Only active</span>
          </label>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Active</th>
                  <th className="text-left px-4 py-2">Created At</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>Loading...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>No subscribers found.</td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{r.email}</td>
                      <td className="px-4 py-2">{r.source || "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 text-xs rounded ${r.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {r.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Tip: Ensure your .env.local has VITE_FIREBASE_* values set and Firestore rules allow read for authorized admins.
        </p>
      </div>
    </div>
  );
}