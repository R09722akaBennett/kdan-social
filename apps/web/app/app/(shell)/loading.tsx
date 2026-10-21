import type { CSSProperties } from 'react';

/**
 * Shown inside the shell while a page renders on the server, after the grey placeholder
 * blocks Buffer draws before a page's data arrives. The sidebar stays, so only the page
 * itself waits.
 */
export default function Loading() {
  return (
    <main className="main" aria-busy="true" aria-label="載入中">
      <div className="stack" style={{ gap: 8 }}>
        <span className="skel" style={{ width: 220, height: 28 }} />
        <span className="skel" style={{ width: 320, height: 14 }} />
      </div>
      <div className="grid" style={{ '--min': '200px' } as CSSProperties}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card stat">
            <span className="skel" style={{ width: '50%', height: 12 }} />
            <span className="skel" style={{ width: '40%', height: 26 }} />
            <span className="skel" style={{ width: '70%', height: 12 }} />
          </div>
        ))}
      </div>
      <div className="grid" style={{ '--min': '360px' } as CSSProperties}>
        {[0, 1].map((i) => (
          <div key={i} className="card">
            <div className="card-head"><span className="skel" style={{ width: 100, height: 16 }} /></div>
            {[0, 1, 2].map((j) => (
              <div key={j} className="list-row">
                <span className="skel" style={{ width: 56, height: 32 }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="skel" style={{ width: '80%', height: 12 }} />
                  <span className="skel" style={{ width: '45%', height: 12 }} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
