'use server';

import { createWorkspaceForUser, saveProfile, WorkspaceError } from '@kdan-social/core';
import { redirect } from 'next/navigation';
import { rememberWorkspace, requireUser } from '@/lib/auth';
import { getDb, signupCodes } from '@/lib/server';

export type FinishState = { error?: string };

/** Save the answers and, when the last step asked for one, create the workspace. */
export async function finishOnboardingAction(_prev: FinishState, formData: FormData): Promise<FinishState> {
  const user = await requireUser();
  const db = getDb();
  let answers: { describes?: string; accounts?: string; platforms?: string[]; goals?: string[] } = {};
  try { answers = JSON.parse(String(formData.get('answers') ?? '{}')); } catch { /* every question can be skipped */ }
  const name = formData.get('name');
  if (name !== null) {
    try {
      const ws = await createWorkspaceForUser(db, {
        userId: user.id, email: user.email, codes: signupCodes(),
        name: String(name), timeZone: String(formData.get('timeZone') ?? ''), code: String(formData.get('code') ?? ''),
      });
      await rememberWorkspace(ws.id);
    } catch (e) {
      if (e instanceof WorkspaceError) return { error: e.message };
      throw e;
    }
  }
  await saveProfile(db, { userId: user.id, answers, done: true });
  redirect('/onboarding/tour');
}
