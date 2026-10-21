// Platform marks drawn small for decoration (welcome screen, onboarding tiles).
const FB = 'M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07';

export function PlatformMark({ pf, size = 24 }: { pf: 'facebook' | 'instagram' | 'line'; size?: number }) {
  if (pf === 'facebook') return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={FB} fill="#1877F2" /></svg>;
  if (pf === 'instagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#C13584" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="#C13584" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#06A94D" />
      <path d="M12 5.5c-4.1 0-7.4 2.6-7.4 5.9 0 2.9 2.6 5.4 6.2 5.8.5.1.6.3.5.7l-.2 1.1c-.1.3.2.6.5.4 2.7-1.6 7.8-4.8 7.8-8 0-3.3-3.3-5.9-7.4-5.9z" fill="#fff" />
    </svg>
  );
}
