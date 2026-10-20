'use client';

import type { ReactNode } from 'react';

/** A submit button that asks before an action that cannot be undone. */
export function ConfirmSubmit({ question, className, children }: { question: string; className?: string; children: ReactNode }) {
  return <button type="submit" className={className} onClick={(e) => { if (!confirm(question)) e.preventDefault(); }}>{children}</button>;
}
