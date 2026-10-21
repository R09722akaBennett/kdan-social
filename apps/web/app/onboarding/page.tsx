import { getProfile, membershipFor } from '@kdan-social/core';
import { zoneOptions } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getDb, signupCodes } from '@/lib/server';
import { Questions } from './questions';

export default async function Onboarding() {
  const user = await requireUser();
  const db = getDb();
  const [profile, membership] = await Promise.all([getProfile(db, user.id), membershipFor(db, user.id)]);
  return (
    <Questions
      needsWorkspace={!membership}
      canCreate={signupCodes().length > 0}
      zones={zoneOptions().map(({ id, label }) => ({ id, label }))}
      suggestedName={profile?.displayName ?? ''}
    />
  );
}
