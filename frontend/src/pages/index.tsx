import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [apiStatus, setApiStatus] = useState<string>('loading...');
  const [wsStatus, setWsStatus] = useState<string>('disconnected');

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${base}/api/healthz`).then(async (r) => {
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      setApiStatus(data.status || 'ok');
    }).catch(() => setApiStatus('unavailable'));

    // WebSocket test
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');
    ws.onerror = () => setWsStatus('error');
    return () => ws.close();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>AIPS Dashboard</h1>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/" style={{ marginRight: 16 }}>Home</Link>
        <Link href="/stores" style={{ marginRight: 16 }}>Stores</Link>
        <Link href="/cameras" style={{ marginRight: 16 }}>Cameras</Link>
        <Link href="/login">Login</Link>
      </nav>
      <div>
        <p>Backend status: {apiStatus}</p>
        <p>WebSocket status: {wsStatus}</p>
      </div>
    </main>
  );
}


