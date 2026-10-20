import { and, eq, gt, sql } from 'drizzle-orm';
import { accountGroups, auditLog, connectedAccounts, type Db } from '../db/index';
import { getGroupVoices, getVoice, normaliseVoice, type GroupVoice, type Voice } from '../voice';
import { AiError, write, type Writer } from './writer';
import { followerSeries, performanceRows } from '../analytics';
import type { GroupFilter } from '../overview';
import { adaptPrompt, BASE_SYSTEM, insightsPrompt, INSIGHTS_SYSTEM, rewritePrompt, samplePrompt, voiceAddendum, type RewriteAction } from './prompts';

const TEXT_MAX = 5000;
// A cost guard, not a product limit: far above what a team does by hand in an hour.
const HOURLY_MAX = 200;

async function guard(db: Db, workspaceId: string, text: string) {
  if (!text.trim()) throw new AiError('先寫一些內容，AI 才能幫忙改。');
  if (text.length > TEXT_MAX) throw new AiError(`內容超過 ${TEXT_MAX} 字，請先縮短。`);
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog)
    .where(and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, 'ai.used'), gt(auditLog.at, new Date(Date.now() - 3_600_000))));
  if ((row?.n ?? 0) >= HOURLY_MAX) throw new AiError('這一小時 AI 用量已達上限，請稍後再試。');
}

async function run(db: Db, writer: Writer, a: { workspaceId: string; actor: string; kind: string; voice: Voice; system: string; prompt: string }) {
  const out = await write(writer, a.voice, { system: a.system, prompt: a.prompt });
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'ai.used', detail: { kind: a.kind, model: out.model ?? null, input: out.usage.input, output: out.usage.output } });
  return { text: out.text, banned: out.banned };
}

/**
 * One of the composer's quick actions on the main text, in the brand voice.
 *
 * Returns:
 *   The suggestion, and any banned word it still contains, for the user to accept or not.
 *
 * Raises:
 *   AiError: empty or too long text, the hourly cap is reached, or the AI failed.
 */
export async function aiRewrite(db: Db, writer: Writer, a: { workspaceId: string; actor: string; action: RewriteAction; text: string; instruction?: string }) {
  if (a.action === 'ask' && !a.instruction?.trim()) throw new AiError('請寫下想怎麼改。');
  await guard(db, a.workspaceId, a.text);
  const voice = await getVoice(db, a.workspaceId);
  return run(db, writer, { ...a, kind: `rewrite:${a.action}`, voice, system: `${BASE_SYSTEM}\n\n${voiceAddendum(voice)}`, prompt: rewritePrompt(a.action, a.text, a.instruction?.slice(0, 500)) });
}

/**
 * Rewrite the main text for one account: its platform's format and its group's rules,
 * which is where a group says which language its accounts write in.
 *
 * Raises:
 *   AiError: the account is not in the workspace, empty or too long text, the hourly
 *     cap is reached, or the AI failed.
 */
export async function aiAdapt(db: Db, writer: Writer, a: { workspaceId: string; actor: string; accountId: string; text: string }) {
  const [row] = await db.select({ account: connectedAccounts, groupName: accountGroups.name }).from(connectedAccounts)
    .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
    .where(and(eq(connectedAccounts.id, a.accountId), eq(connectedAccounts.workspaceId, a.workspaceId)));
  if (!row) throw new AiError('找不到這個帳號，請重新整理後再試。');
  await guard(db, a.workspaceId, a.text);
  const voice = await getVoice(db, a.workspaceId);
  const groupVoice = row.account.groupId ? (await getGroupVoices(db, a.workspaceId)).get(row.account.groupId) : undefined;
  const addendum = voiceAddendum(voice, row.groupName ? { name: row.groupName, voice: groupVoice } : undefined);
  return run(db, writer, { ...a, kind: `adapt:${row.account.platform}`, voice, system: `${BASE_SYSTEM}\n\n${addendum}`, prompt: adaptPrompt(a.text, { name: row.account.name, platform: row.account.platform }) });
}

/**
 * A sample post for the brand voice page, written with settings that may not be saved yet,
 * once for the brand and once per group that has its own rules.
 *
 * Raises:
 *   AiError: empty topic, the hourly cap is reached, or the AI failed.
 */
export async function aiSamples(db: Db, writer: Writer, a: { workspaceId: string; actor: string; topic: string; voice: Voice; groups: Array<{ id: string; name: string; voice: GroupVoice }> }) {
  await guard(db, a.workspaceId, a.topic);
  const voice = normaliseVoice(a.voice);
  const targets = [{ id: null as string | null, name: '品牌', group: undefined as { name: string; voice: GroupVoice } | undefined },
    ...a.groups.filter((g) => g.voice.rules.trim() || g.voice.examples.length).slice(0, 5).map((g) => ({ id: g.id as string | null, name: g.name, group: { name: g.name, voice: g.voice } }))];
  return Promise.all(targets.map(async (t) => ({
    groupId: t.id,
    name: t.name,
    ...(await run(db, writer, { workspaceId: a.workspaceId, actor: a.actor, kind: 'sample', voice, system: `${BASE_SYSTEM}\n\n${voiceAddendum(voice, t.group)}`, prompt: samplePrompt(a.topic.slice(0, 500)) })),
  })));
}

/**
 * Findings for the analytics page, written from the same numbers the page shows.
 *
 * Raises:
 *   AiError: there is nothing to analyse yet, the hourly cap is reached, or the AI failed.
 */
export async function aiInsights(db: Db, writer: Writer, a: { workspaceId: string; actor: string; days: number; groupIds?: GroupFilter; now?: Date }) {
  const now = a.now ?? new Date();
  const [series, perf, accounts] = await Promise.all([
    followerSeries(db, { workspaceId: a.workspaceId, days: a.days, now }),
    performanceRows(db, { workspaceId: a.workspaceId, from: new Date(now.getTime() - a.days * 86_400_000), groupIds: a.groupIds, limit: 60 }),
    db.select({ id: connectedAccounts.id, name: connectedAccounts.name, platform: connectedAccounts.platform, groupId: connectedAccounts.groupId, groupName: accountGroups.name }).from(connectedAccounts)
      .leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId)).where(eq(connectedAccounts.workspaceId, a.workspaceId)),
  ]);
  const inFilter = (groupId: string | null) => !a.groupIds?.length || a.groupIds.includes(groupId);
  const lines: string[] = ['# Followers (first and last daily snapshot in the period)'];
  let followerLines = 0;
  for (const acc of accounts) {
    const s = series.get(acc.id);
    if (!s?.length || !inFilter(acc.groupId)) continue;
    followerLines++;
    lines.push(`- ${acc.name} (${acc.platform}${acc.groupName ? `, group ${acc.groupName}` : ''}): ${s[0]!.followers} on ${s[0]!.day} -> ${s.at(-1)!.followers} on ${s.at(-1)!.day}`);
  }
  lines.push('', '# Published posts (engagements: FB reactions+comments+shares, IG likes+comments, LINE clicks; opens: LINE only)');
  for (const p of perf) lines.push(`- ${p.publishedAt?.toISOString().slice(0, 16)} ${p.account} (${p.platform}${p.source === 'platform' ? ', posted outside kdan-social' : ''}): "${p.title}" engagements=${p.engagements ?? 'n/a'}${p.opens != null ? ` opens=${p.opens}` : ''}`);
  if (!followerLines && !perf.length) throw new AiError('還沒有足夠的數字可以分析；粉絲數每天更新一次，發文後隔天會有互動數。');
  await guard(db, a.workspaceId, 'x');
  const out = await writer({ system: INSIGHTS_SYSTEM, prompt: insightsPrompt(lines.join('\n'), a.days) });
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'ai.used', detail: { kind: 'insights', model: out.model ?? null, input: out.usage.input, output: out.usage.output } });
  return out.text.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
}
