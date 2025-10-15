import { useEffect, useState } from 'react';

type Store = { id: string; name: string };

export default function Stores() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const [items, setItems] = useState<Store[]>([]);
  const [name, setName] = useState('');

  const load = async () => {
    const res = await fetch(`${base}/api/stores`);
    const data = await res.json();
    setItems(data);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${base}/api/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setName('');
    load();
  };

  useEffect(() => { load(); }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Stores</h1>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16 }}>Home</a>
        <a href="/stores" style={{ marginRight: 16 }}>Stores</a>
        <a href="/cameras" style={{ marginRight: 16 }}>Cameras</a>
        <a href="/login">Login</a>
      </nav>
      <form onSubmit={create} style={{ marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Store name" />
        <button type="submit">Create</button>
      </form>
      <ul>
        {items.map(s => <li key={s.id}>{s.name}</li>)}
      </ul>
    </main>
  );
}


