import { bannedHits } from '../voice-rules';
import type { Voice } from '../voice';

/** An AI request that could not be answered; the message is shown to the user as is. */
export class AiError extends Error {}

export type AiUsage = { input: number; output: number };
/** Turns a system prompt and one user turn into text. Swapped for a fake in tests. */
export type Writer = (req: { system: string; prompt: string }) => Promise<{ text: string; usage: AiUsage; model?: string }>;

export type AiTask = 'write' | 'insights';

/**
 * The model spec for a task. `AI_MODEL` covers everything and `AI_MODEL_INSIGHTS` may
 * override the analytics findings; with neither set, an Anthropic key alone still works.
 */
export function modelFor(task: AiTask, env = process.env): string | null {
  const spec = (task === 'insights' && env.AI_MODEL_INSIGHTS) || env.AI_MODEL;
  if (spec) return spec;
  return env.ANTHROPIC_API_KEY ? 'anthropic/claude-opus-5-5' : null;
}

/** Whether this deployment has a model and credentials for it; the UI hides AI actions when not. */
export function aiConfigured(env = process.env): boolean {
  const spec = modelFor('write', env);
  if (!spec) return false;
  return spec.startsWith('anthropic/') ? !!env.ANTHROPIC_API_KEY : !!env.GCP_PROJECT_ID;
}

/** Run one request and flag any banned word the answer still contains. */
export async function write(writer: Writer, voice: Voice, req: { system: string; prompt: string }) {
  const out = await writer(req);
  return { ...out, banned: bannedHits(out.text, voice.banned) };
}
