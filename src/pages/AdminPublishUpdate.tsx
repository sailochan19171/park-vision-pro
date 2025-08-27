import { useState } from "react";

export default function AdminPublishUpdate() {
  const [title, setTitle] = useState("VayAccess Live Update");
  const [body, setBody] = useState("We have shipped new features and improvements.");
  const [link, setLink] = useState("/");
  const [status, setStatus] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{emailsCount:number; tokensCount:number} | null>(null);

  const API_BASE = ((import.meta as any).env.VITE_API_BASE_URL || (import.meta as any).env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '') + '/api';
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-token': (import.meta as any).env.VITE_NEWSLETTER_ADMIN_TOKEN || ''
  } as Record<string,string>;

  const handlePreview = async () => {
    setStatus('Generating preview...');
    setPreviewStats(null);
    try {
      const res = await fetch(`${API_BASE}/updates/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body, link, previewOnly: true })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setPreviewStats({ emailsCount: json.emailsCount, tokensCount: json.tokensCount });
      setStatus(`Preview ready: emails=${json.emailsCount}, pushTokens=${json.tokensCount}`);
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  const handlePublish = async () => {
    setStatus('Publishing update...');
    try {
      const res = await fetch(`${API_BASE}/updates/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body, link, previewOnly: false })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setStatus(`Published: emails sent=${json.emails.sent}/${json.emails.total} (failed ${json.emails.failed}), push sent=${json.push.sent}/${json.push.total} (failed ${json.push.failed})`);
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Publish Live Update</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4 bg-white p-4 border rounded">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full border px-3 py-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Body</label>
              <textarea value={body} onChange={(e)=>setBody(e.target.value)} className="w-full border px-3 py-2 rounded" rows={6} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Link</label>
              <input value={link} onChange={(e)=>setLink(e.target.value)} className="w-full border px-3 py-2 rounded" placeholder="/products" />
            </div>
            <div className="flex gap-2">
              <button onClick={handlePreview} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">Preview</button>
              <button onClick={handlePublish} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Publish</button>
            </div>
            {status && <p className="text-sm mt-2">{status}</p>}
          </div>
          <div className="bg-white p-4 border rounded">
            <h2 className="font-semibold mb-2">Live Preview</h2>
            <div className="border rounded p-3">
              <h3 className="text-lg font-bold mb-2">{title}</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{body}</p>
              <a href={link} className="inline-block mt-3 text-blue-600 underline">{link}</a>
            </div>
            {previewStats && (
              <p className="text-xs text-gray-500 mt-3">Targets: {previewStats.emailsCount} emails, {previewStats.tokensCount} push tokens</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}