import { and, eq, inArray } from 'drizzle-orm';
import { accountGroups, auditLog, brandVoices, groupVoices, type Db, type GlossaryEntry } from './db/index';

/** A brand voice change refused; the message is shown to the user as is. */
export class VoiceError extends Error {}

type Role = 'owner' | 'admin' | 'editor' | 'reviewer';
export type Voice = { about: string; formality: number; persuasion: number; emoji: 'none' | 'few' | 'many'; banned: string[]; glossary: GlossaryEntry[] };
export type GroupVoice = { rules: string; examples: string[] };

export const DEFAULT_VOICE: Voice = { about: '', formality: 40, persuasion: 30, emoji: 'few', banned: [], glossary: [] };
const LIMITS = { about: 2000, rules: 2000, example: 1000, examples: 10, banned: 50, word: 40, glossary: 100, term: 80 };

/** The workspace's voice, or the defaults when it has never been saved. */
export async function getVoice(db: Db, workspaceId: string): Promise<Voice> {
  const [v] = await db.select().from(brandVoices).where(eq(brandVoices.workspaceId, workspaceId));
  return v ? { about: v.about, formality: v.formality, persuasion: v.persuasion, emoji: v.emoji, banned: v.banned, glossary: v.glossary } : { ...DEFAULT_VOICE };
}

/** Each group's added rules, keyed by group id; groups without any are absent. */
export async function getGroupVoices(db: Db, workspaceId: string): Promise<Map<string, GroupVoice>> {
  const rows = await db.select({ groupId: groupVoices.groupId, rules: groupVoices.rules, examples: groupVoices.examples }).from(groupVoices)
    .innerJoin(accountGroups, eq(accountGroups.id, groupVoices.groupId)).where(eq(accountGroups.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.groupId, { rules: r.rules, examples: r.examples }]));
}

const clean = (list: string[], max: number, each: number) => [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, max).map((s) => s.slice(0, each));

/**
 * Check and normalise a voice: trim, drop empties and duplicates, clamp sliders.
 *
 * Raises:
 *   VoiceError: a field is longer than the page allows.
 */
export function normaliseVoice(v: Voice): Voice {
  if (v.about.length > LIMITS.about) throw new VoiceError(`品牌介紹最多 ${LIMITS.about} 字。`);
  if (v.banned.length > LIMITS.banned) throw new VoiceError(`禁用詞最多 ${LIMITS.banned} 個。`);
  if (v.glossary.length > LIMITS.glossary) throw new VoiceError(`詞彙表最多 ${LIMITS.glossary} 條。`);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 50)));
  return {
    about: v.about.trim(),
    formality: clamp(v.formality),
    persuasion: clamp(v.persuasion),
    emoji: (['none', 'few', 'many'] as const).includes(v.emoji) ? v.emoji : 'few',
    banned: clean(v.banned, LIMITS.banned, LIMITS.word),
    glossary: v.glossary.map((g) => ({ term: g.term.trim().slice(0, LIMITS.term), rule: g.rule.trim().slice(0, LIMITS.term * 2) })).filter((g) => g.term),
  };
}

function normaliseGroup(g: GroupVoice): GroupVoice {
  if (g.rules.length > LIMITS.rules) throw new VoiceError(`群組規則最多 ${LIMITS.rules} 字。`);
  if (g.examples.length > LIMITS.examples) throw new VoiceError(`範例貼文最多 ${LIMITS.examples} 篇。`);
  return { rules: g.rules.trim(), examples: clean(g.examples, LIMITS.examples, LIMITS.example) };
}

/**
 * Save the brand voice and any groups' added rules in one go.
 *
 * Raises:
 *   VoiceError: the caller is neither an owner nor an admin, a field is too long,
 *     or a group is not in the workspace.
 */
export async function saveVoice(db: Db, a: { workspaceId: string; voice: Voice; groups?: Record<string, GroupVoice>; actor: string; role: Role }) {
  if (a.role !== 'owner' && a.role !== 'admin') throw new VoiceError('只有擁有者或管理員可以修改品牌語氣。');
  const voice = normaliseVoice(a.voice);
  const groups = Object.entries(a.groups ?? {}).map(([id, g]) => [id, normaliseGroup(g)] as const);
  await db.transaction(async (tx) => {
    if (groups.length) {
      const owned = await tx.select({ id: accountGroups.id }).from(accountGroups)
        .where(and(eq(accountGroups.workspaceId, a.workspaceId), inArray(accountGroups.id, groups.map(([id]) => id))));
      if (owned.length !== groups.length) throw new VoiceError('找不到其中一個群組，請重新整理後再試。');
    }
    const now = new Date();
    await tx.insert(brandVoices).values({ workspaceId: a.workspaceId, ...voice, updatedBy: a.actor, updatedAt: now })
      .onConflictDoUpdate({ target: brandVoices.workspaceId, set: { ...voice, updatedBy: a.actor, updatedAt: now } });
    for (const [groupId, g] of groups) {
      await tx.insert(groupVoices).values({ groupId, ...g, updatedAt: now }).onConflictDoUpdate({ target: groupVoices.groupId, set: { ...g, updatedAt: now } });
    }
    await tx.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'voice.saved', detail: { groups: groups.length, banned: voice.banned.length } });
  });
}
