import { useState } from "react";

export default function AdminSendUpdate() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("VayAccess Update");
  const [message, setMessage] = useState("We have published a new update on our site.");
  const [link, setLink] = useState("/");
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Sending...");
    try {
      const API_BASE = ((import.meta as any).env.VITE_API_BASE_URL || (import.meta as any).env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '') + '/api';
      const res = await fetch(`${API_BASE}/newsletter/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': (import.meta as any).env.VITE_NEWSLETTER_ADMIN_TOKEN || ''
        },
        body: JSON.stringify({
          to,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="margin:0 0 12px 0;">${subject}</h2>
              <p style="color:#374151; line-height:1.6;">${message}</p>
              <p style="margin-top:16px;"><a href="${link}" style="color:#2563eb; text-decoration:none;">View update</a></p>
            </div>
          `,
          text: `${subject}\n\n${message}\n\nLink: ${link}`
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setStatus('Email sent successfully.');
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Send Update Email</h1>
        <form onSubmit={handleSend} className="space-y-4 bg-white p-4 border rounded">
          <div>
            <label className="block text-sm font-medium mb-1">Recipient Email</label>
            <input value={to} onChange={(e)=>setTo(e.target.value)} type="email" required className="w-full border px-3 py-2 rounded" placeholder="user@example.com" />
          </div>
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
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Send</button>
        </form>
        {status && <p className="mt-4 text-sm">{status}</p>}
      </div>
    </div>
  );
}