'use client';

import { useState, useTransition } from 'react';
import type { InsightsResult } from '@/app/app/actions';

/** Ask for AI findings on demand, so opening the page never spends tokens. */
export function InsightsButton({ days, groups, run }: { days: number; groups: string[]; run: (input: { days: number; groups: string[] }) => Promise<InsightsResult> }) {
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 8 }}>
      {result?.findings && <ul className="stack" style={{ gap: 6 }}>{result.findings.map((f) => <li key={f}>{f}</li>)}</ul>}
      {result?.error && <div className="small" role="alert" style={{ color: 'var(--err)' }}>{result.error}</div>}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={pending} onClick={() => start(async () => setResult(await run({ days, groups })))}>
        {pending ? '整理中…' : result ? '重新整理' : '請 AI 整理重點'}
      </button>
    </div>
  );
}
