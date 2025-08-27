import { useState } from "react";

export default function AdminBroadcast() {
  const [subject, setSubject] = useState("VayAccess Update");
  const [message, setMessage] = useState("We have published a new update on our site.");
  const [link, setLink] = useState("/");
  const [onlyActive, setOnlyActive] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>([]);

  const API_BASE = ((import.meta as any).env.VITE_API_BASE_URL || (import.meta as any).env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '') + '/api';
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-token': (import.meta as any).env.VITE_NEWSLETTER_ADMIN_TOKEN || ''
  } as Record<string,string>;

  const buildPayload = () => ({
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="margin:0 0 12px 0;">${subject}</h2>
        <p style="color:#374151; line-height:1.6;">${message}</p>
        <p style="margin-top:16px;"><a href="${link}" style="color:#2563eb; text-decoration:none;">View update</a></p>
      </div>
    `,
    text: `${subject}\n\n${message}\n\nLink: ${link}`,
    onlyActive,
  });

  const handleDryRun = async () => {
    setStatus('Loading recipients...');
    setEmails([]);
    try {
      const res = await fetch(`${API_BASE}/newsletter/broadcast`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...buildPayload(), dryRun: true })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setEmails(json.emails || []);
      setStatus(`Dry run: ${json.count || 0} recipients`);
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  const handleBroadcast = async () => {
    setStatus('Sending broadcast...');
    try {
      const res = await fetch(`${API_BASE}/newsletter/broadcast`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...buildPayload(), dryRun: false })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setStatus(`Broadcast completed: sent=${json.sent}, failed=${json.failed}, total=${json.count}`);
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Broadcast Update to Subscribers</h1>
        <div className="space-y-4 bg-white p-4 border rounded">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input value={subject} onChange={(e)=>setSubject(e.target.value)} className="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea value={message} onChange={(e)=>setMessage(e.target.value)} className="w-full border px-3 py-2 rounded" rows={5} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Link</label>
            <input value={link} onChange={(e)=>setLink(e.target.value)} className="w-full border px-3 py-2 rounded" placeholder="/products" />
          </div>
          <label className="inline-flex items-center space-x-2">
            <input type="checkbox" className="h-4 w-4" checked={onlyActive} onChange={(e)=>setOnlyActive(e.target.checked)} />
            <span className="text-sm">Only active subscribers</span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleDryRun} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">Dry Run</button>
            <button onClick={handleBroadcast} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Send Broadcast</button>
          </div>
          {status && <p className="text-sm mt-2">{status}</p>}
          {emails.length > 0 && (
            <div className="mt-3">
              <h3 className="font-medium mb-2 text-sm">Recipients ({emails.length}):</h3>
              <div className="max-h-48 overflow-auto border rounded p-2 text-xs bg-gray-50">
                {emails.map((e) => <div key={e}>{e}</div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}