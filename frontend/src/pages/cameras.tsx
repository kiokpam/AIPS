import { useEffect, useState } from 'react';

type Camera = { id: string; store_id: string; name: string; rtsp_url?: string };

export default function Cameras() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const [items, setItems] = useState<Camera[]>([]);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [rtsp, setRtsp] = useState('');

  const load = async () => {
    const res = await fetch(`${base}/api/cameras`);
    const data = await res.json();
    setItems(data);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${base}/api/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, store_id: storeId, rtsp_url: rtsp || null }),
    });
    setName(''); setStoreId(''); setRtsp('');
    load();
  };

  useEffect(() => { load(); }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Cameras</h1>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16 }}>Home</a>
        <a href="/stores" style={{ marginRight: 16 }}>Stores</a>
        <a href="/cameras" style={{ marginRight: 16 }}>Cameras</a>
        <a href="/login">Login</a>
      </nav>
      <form onSubmit={create} style={{ marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camera name" />
        <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="Store ID" />
        <input value={rtsp} onChange={(e) => setRtsp(e.target.value)} placeholder="RTSP URL (optional)" />
        <button type="submit">Create</button>
      </form>
      <ul>
        {items.map(c => <li key={c.id}>{c.name} — store: {c.store_id}</li>)}
      </ul>
    </main>
  );
}


