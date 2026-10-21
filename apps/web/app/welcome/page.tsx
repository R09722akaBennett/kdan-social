import { getProfile } from '@kdan-social/core';
import { PlatformMark } from '@/components/brand-icons';
import { Icon, type IconName } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/server';

// Where each floating tile sits (% of the screen), what it shows, and its timing (s).
type Tile = { x: number; y: number; show: 'facebook' | 'instagram' | 'line' | IconName; tint?: string; delay: number; dur: number };
const TILES: Tile[] = [
  { x: 14, y: 18, show: 'calendar', tint: '#E9EEFD', delay: 0, dur: 7 },
  { x: 30, y: 9, show: 'instagram', delay: 1.4, dur: 8 },
  { x: 72, y: 11, show: 'chart', tint: '#E5F4EA', delay: .6, dur: 7.5 },
  { x: 86, y: 24, show: 'facebook', delay: 2.2, dur: 8.5 },
  { x: 8, y: 46, show: 'line', delay: 3, dur: 7 },
  { x: 24, y: 62, show: 'spark', tint: '#F1EAFD', delay: .9, dur: 9 },
  { x: 90, y: 52, show: 'send', tint: '#FFF3DC', delay: 1.8, dur: 7.5 },
  { x: 76, y: 70, show: 'instagram', delay: 3.6, dur: 8 },
  { x: 42, y: 80, show: 'facebook', delay: 2.6, dur: 8.5 },
  { x: 60, y: 86, show: 'bell', tint: '#FDECEC', delay: .3, dur: 7 },
  { x: 12, y: 82, show: 'check', tint: '#E5F4EA', delay: 4.2, dur: 8 },
  { x: 92, y: 84, show: 'line', delay: 1.1, dur: 9 },
];

/**
 * The first screen after sign-up, after Buffer's "Hey there … Welcome": one greeting and
 * one button, over platform marks that drift in and out of a faint grid.
 */
export default async function Welcome() {
  const user = await requireUser();
  const profile = await getProfile(getDb(), user.id);
  const name = profile?.displayName || user.email.split('@')[0];
  return (
    <main className="welcome">
      <div className="welcome-grid" aria-hidden="true" />
      {TILES.map((t, i) => (
        <span key={i} className="welcome-tile" aria-hidden="true"
          style={{ left: `${t.x}%`, top: `${t.y}%`, background: t.tint ?? '#fff', animationDelay: `${t.delay}s`, animationDuration: `${t.dur}s` }}>
          {t.show === 'facebook' || t.show === 'instagram' || t.show === 'line'
            ? <PlatformMark pf={t.show} size={24} />
            : <span style={{ color: 'var(--ink-2)', display: 'flex' }}><Icon name={t.show} size={22} /></span>}
        </span>
      ))}
      <header className="welcome-head"><span className="brand"><span className="brand-mark">K</span>kdan-social</span></header>
      <section className="welcome-center">
        <h1 className="welcome-title">嗨，{name} <span className="wave" aria-hidden="true">👋</span><br />歡迎使用 kdan-social</h1>
        <p className="welcome-sub">先回答幾個問題，我們幫你把工作區準備好。大約 1 分鐘。</p>
        <a href="/onboarding" className="btn btn-primary welcome-cta">開始吧 <span aria-hidden="true">→</span></a>
      </section>
    </main>
  );
}
