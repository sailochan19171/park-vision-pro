import React, { useEffect, useState } from 'react';

interface Article { _id: string; title: string; summary: string; createdAt: string; tags?: string[] }

export default function News() {
  const [items, setItems] = useState<Article[]>([]);
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = tag ? `?tag=${encodeURIComponent(tag)}` : '';
    fetch(`/api/articles${q}`)
      .then(r => r.json())
      .then(d => { if (d.success) setItems(d.items || []); })
      .finally(() => setLoading(false));
  }, [tag]);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Latest Updates</h1>
      <div className="mb-4 flex items-center gap-2">
        <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="Filter by tag" className="px-3 py-2 border rounded" />
      </div>
      {loading ? <p>Loading...</p> : (
        <div className="space-y-4">
          {items.map(a => (
            <div key={a._id} className="border p-4 rounded">
              <h2 className="font-semibold">{a.title}</h2>
              <p className="text-gray-600">{a.summary}</p>
              <small className="text-gray-500">{new Date(a.createdAt).toLocaleString()}</small>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500">No articles available.</p>}
        </div>
      )}
    </div>
  );
}