import Link from 'next/link';

export default function Home() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0a0a0a',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif'
        }}>
            <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>📊 Nexhacks</h1>
            <p style={{ color: '#888', marginBottom: '32px' }}>Codebase Documentation Agent</p>
            <Link
                href="/visualizer"
                style={{
                    padding: '16px 32px',
                    background: '#4299e1',
                    color: '#fff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontSize: '18px',
                    fontWeight: 'bold'
                }}
            >
                Open Visualizer →
            </Link>
        </div>
    );
}
