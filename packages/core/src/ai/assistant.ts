import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { dailyTotals, followerSeries, performanceRows } from '../analytics';
import { accountGroups, aiConversations, aiMessages, auditLog, connectedAccounts, postVariants, posts, publishTasks, workspaces, type Db, type PlanItem } from '../db/index';
import { tasksBetween } from '../overview';
import { formatInZone } from '../time';
import { getVoice } from '../voice';
import { voiceAddendum } from './prompts';
import { checkAiRequest } from './service';
import { AiError, type Writer } from './writer';

const MESSAGE_MAX = 2000;
const HISTORY_TURNS = 12;
const PLAN_MAX = 15;
const BODY_MAX = 2000;

export const ASSISTANT_SYSTEM = `You are the assistant inside kdan-social, a tool a brand's marketing team uses to schedule posts to its Facebook pages, Instagram business accounts and LINE Official Accounts, and to read how they perform.

You answer questions about this workspace and help plan and draft posts. You only know what is in <workspace_data>; you cannot see anything else, browse, or act on the accounts. When the data does not answer a question, say so and say what would.
The account refs (A1, A2...) are for the plan block only; in prose, call accounts by their names.
Answer in the language of the latest question; default to Traditional Chinese (Taiwan). Be concise: short paragraphs or a short list, no headings unless the answer is long. Quote the numbers you rely on and name where they come from (粉絲數快照, 貼文互動, 排程). Never invent numbers, offers, dates or links.

When asked to plan or draft posts, also output the posts in one fenced block tagged "plan", after your prose:
\`\`\`plan
[{"date":"2026-11-03","time":"20:00","accounts":["A1","A2"],"topic":"short topic in the user's language","body":"the post text"}]
\`\`\`
- "date" and "time" are the wall clock in each listed account's own time zone; pick times from the data when it shows when the audience responds, and say why.
- "accounts" uses the account refs (A1, A2...) from <workspace_data>; only active accounts. Put accounts that share the same text and time in one post rather than repeating it.
- "body" is a complete first draft in the brand voice, at most 300 characters, following each platform's habits (Instagram: no raw links; LINE: short, no hashtags).
- At most ${PLAN_MAX} posts per answer; if asked for more, plan the first ${PLAN_MAX} and offer to continue.
- Only output this block when posts are asked for. People open each post in the composer to review it; nothing is scheduled or published by you.`;

type Ref = { ref: string; id: string; name: string; platform: string; status: string };

/**
 * Everything the assistant may know about a workspace, as text. Read-only and limited
 * to this workspace; each section is capped so a big workspace cannot blow the prompt.
 */
export async function workspaceDigest(db: Db, workspaceId: string, now = new Date()): Promise<{ text: string; refs: Ref[] }> {
  const day = 86_400_000;
  const [[ws], accounts, series, totals, perf, upcoming, failed, pending] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
    db.select({ id: connectedAccounts.id, name: connectedAccounts.name, platform: connectedAccounts.platform, status: connectedAccounts.status, timeZone: connectedAccounts.timeZone, group: accountGroups.name })
      .from(connectedAccounts).leftJoin(accountGroups, eq(accountGroups.id, connectedAccounts.groupId))
      .where(eq(connectedAccounts.workspaceId, workspaceId)).orderBy(connectedAccounts.createdAt),
    followerSeries(db, { workspaceId, days: 30, now }),
    dailyTotals(db, { workspaceId, from: new Date(now.getTime() - 30 * day), to: now }),
    performanceRows(db, { workspaceId, from: new Date(now.getTime() - 30 * day), limit: 40 }),
    tasksBetween(db, { workspaceId, from: now, to: new Date(now.getTime() + 21 * day), limit: 60 }),
    tasksBetween(db, { workspaceId, from: new Date(now.getTime() - 7 * day), to: now, statuses: ['failed', 'needs_check', 'missed'], limit: 20 }),
    db.selectDistinct({ id: posts.id, title: posts.title }).from(posts)
      .innerJoin(postVariants, eq(postVariants.postId, posts.id)).innerJoin(publishTasks, eq(publishTasks.variantId, postVariants.id))
      .where(and(eq(posts.workspaceId, workspaceId), inArray(postVariants.reviewStatus, ['pending', 'changes_requested']), eq(publishTasks.status, 'scheduled')))
      .limit(20),
  ]);
  const tz = ws?.timeZone ?? 'Asia/Taipei';
  const refs: Ref[] = accounts.map((a, i) => ({ ref: `A${i + 1}`, id: a.id, name: a.name, platform: a.platform, status: a.status }));
  const refOf = (id: string) => refs.find((r) => r.id === id)?.ref ?? '?';
  const t = (d: Date, zone = tz) => formatInZone(d, zone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
  const lines = [
    `Workspace "${ws?.name}". Now: ${now.toISOString().slice(0, 4)}/${t(now)} ${weekday}, ${tz}. Review before publishing: ${ws?.requiresReview ? 'on for editors' : 'off'}.`,
    '',
    '# Accounts (ref, name, platform, group, time zone, followers 30 days ago -> latest, status)',
  ];
  for (const [i, a] of accounts.entries()) {
    const s = series.get(a.id);
    const f = s?.length ? `${s[0]!.followers} -> ${s.at(-1)!.followers}` : 'no snapshot yet';
    lines.push(`- ${refs[i]!.ref}: ${a.name}, ${a.platform}, ${a.group ?? 'no group'}, ${a.timeZone}, ${f}, ${a.status}`);
  }
  if (!accounts.length) lines.push('- none connected yet');
  const fmtT = (x: Record<string, number | null>) => Object.entries(x).map(([k, v]) => `${k}=${v ?? 'n/a'}`).join(' ');
  lines.push('', '# Last 30 days, all accounts (reach is summed per day and account)', `- this period: ${fmtT(totals.current)}`, `- previous 30 days: ${fmtT(totals.previous)}`);
  lines.push('', '# Published posts, last 30 days, newest first (time in the account\'s zone; engagements: FB reactions+comments+shares, IG likes+comments, LINE clicks)');
  for (const p of perf) {
    const zone = accounts.find((a) => a.id === p.accountId)?.timeZone ?? tz;
    lines.push(`- ${p.publishedAt ? t(p.publishedAt, zone) : '?'} ${refOf(p.accountId)} "${p.title.slice(0, 60)}" engagements=${p.engagements ?? 'n/a'} reach=${p.reach ?? 'n/a'} views=${p.views ?? 'n/a'}${p.opens != null ? ` opens=${p.opens}` : ''}${p.source === 'platform' ? ' (posted outside kdan-social)' : ''}`);
  }
  if (!perf.length) lines.push('- none');
  lines.push('', '# Scheduled, next 21 days (time in the account\'s zone)');
  for (const u of upcoming.filter((x) => x.status === 'scheduled')) lines.push(`- ${t(u.runAt, u.timeZone)} ${refOf(u.accountId)} "${u.title.slice(0, 60)}" review=${u.review}`);
  if (!upcoming.some((x) => x.status === 'scheduled')) lines.push('- none');
  lines.push('', '# Waiting for review or sent back');
  for (const p of pending) lines.push(`- "${p.title.slice(0, 60)}"`);
  if (!pending.length) lines.push('- none');
  lines.push('', '# Problems in the last 7 days');
  for (const f of failed) lines.push(`- ${t(f.runAt, f.timeZone)} ${refOf(f.accountId)} "${f.title.slice(0, 60)}" ${f.status}: ${(f.lastError ?? '').slice(0, 120)}`);
  for (const a of accounts.filter((x) => x.status !== 'active')) lines.push(`- ${refOf(a.id)} authorization ${a.status}; it cannot publish until reconnected`);
  if (!failed.length && accounts.every((x) => x.status === 'active')) lines.push('- none');
  return { text: lines.join('\n'), refs };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Split a reply into its prose and its plan, keeping only plan items that name a real,
 * active account of the workspace and a valid date and time.
 *
 * Returns:
 *   The prose; the plan, or null when there was none; and whether a plan block was
 *   present but unreadable (usually cut off by the output limit).
 */
export function splitPlan(reply: string, refs: Ref[]): { text: string; plan: PlanItem[] | null; broken: boolean } {
  // Models still drop a ref into prose now and then; readers know accounts by name.
  const byRef = new Map(refs.map((r) => [r.ref, r.name]));
  const named = (s: string) => s.replace(/(?<![A-Za-z0-9])A\d+(?![A-Za-z0-9])/g, (r) => (byRef.has(r) ? `「${byRef.get(r)}」` : r));
  const m = reply.match(/```plan\s*([\s\S]*?)(```|$)/);
  if (!m) return { text: named(reply.trim()), plan: null, broken: false };
  const text = named(reply.replace(m[0], '').trim());
  let raw: unknown;
  try { raw = JSON.parse(m[1]!); } catch { return { text, plan: null, broken: true }; }
  if (!Array.isArray(raw)) return { text, plan: null, broken: true };
  const active = new Map(refs.filter((r) => r.status === 'active').map((r) => [r.ref, r.id]));
  const plan: PlanItem[] = [];
  for (const it of raw.slice(0, PLAN_MAX)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const accountIds = (Array.isArray(o.accounts) ? o.accounts : []).map((r) => active.get(String(r))).filter((x): x is string => !!x);
    if (!DATE.test(String(o.date)) || !TIME.test(String(o.time)) || !accountIds.length) continue;
    plan.push({ date: String(o.date), time: String(o.time), accountIds: [...new Set(accountIds)], topic: String(o.topic ?? '').slice(0, 120), body: String(o.body ?? '').slice(0, BODY_MAX) });
  }
  return { text, plan, broken: false };
}

/** The member's conversations in a workspace, most recently active first. */
export function listConversations(db: Db, a: { workspaceId: string; userId: string; limit?: number }) {
  return db.select().from(aiConversations)
    .where(and(eq(aiConversations.workspaceId, a.workspaceId), eq(aiConversations.userId, a.userId)))
    .orderBy(desc(aiConversations.updatedAt)).limit(a.limit ?? 50);
}

/** One conversation with its messages, or null when it is not this member's. */
export async function getConversation(db: Db, a: { workspaceId: string; userId: string; id: string }) {
  const [c] = await db.select().from(aiConversations)
    .where(and(eq(aiConversations.id, a.id), eq(aiConversations.workspaceId, a.workspaceId), eq(aiConversations.userId, a.userId)));
  if (!c) return null;
  const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, c.id)).orderBy(asc(aiMessages.createdAt));
  return { conversation: c, messages };
}

export async function deleteConversation(db: Db, a: { workspaceId: string; userId: string; id: string }) {
  await db.delete(aiConversations).where(and(eq(aiConversations.id, a.id), eq(aiConversations.workspaceId, a.workspaceId), eq(aiConversations.userId, a.userId)));
}

/** One proposed post, for opening in the composer; null unless it is in this member's conversation. */
export async function planItem(db: Db, a: { workspaceId: string; userId: string; messageId: string; index: number }): Promise<PlanItem | null> {
  const [row] = await db.select({ plan: aiMessages.plan }).from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(eq(aiMessages.id, a.messageId), eq(aiConversations.workspaceId, a.workspaceId), eq(aiConversations.userId, a.userId)));
  return row?.plan?.[a.index] ?? null;
}

/**
 * Answer one message in a conversation, starting a new one when `conversationId` is omitted.
 *
 * Nothing is saved unless the AI answers, so a failed question can simply be sent again.
 *
 * Returns:
 *   The conversation the answer was added to.
 *
 * Raises:
 *   AiError: the message is empty or too long, the conversation is not this member's,
 *     the hourly cap is reached, or the AI failed.
 */
export async function askAssistant(db: Db, writer: Writer, a: { workspaceId: string; userId: string; actor: string; conversationId?: string; message: string; now?: Date }) {
  const message = a.message.trim();
  if (message.length > MESSAGE_MAX) throw new AiError(`訊息最多 ${MESSAGE_MAX} 字。`);
  await checkAiRequest(db, a.workspaceId, message);
  const existing = a.conversationId ? await getConversation(db, { workspaceId: a.workspaceId, userId: a.userId, id: a.conversationId }) : null;
  if (a.conversationId && !existing) throw new AiError('找不到這段對話，請重新整理後再試。');

  const [{ text: digest, refs }, voice] = await Promise.all([workspaceDigest(db, a.workspaceId, a.now), getVoice(db, a.workspaceId)]);
  const history = (existing?.messages ?? []).slice(-HISTORY_TURNS).map((m) => {
    const plan = m.plan?.length ? `\n[proposed ${m.plan.length} posts: ${m.plan.map((p) => `${p.date} ${p.time} ${p.topic}`).join('; ')}]` : '';
    return `<${m.role}>\n${m.content}${plan}\n</${m.role}>`;
  });
  const prompt = `<workspace_data>\n${digest}\n</workspace_data>\n\n${history.length ? `<conversation>\n${history.join('\n')}\n</conversation>\n\n` : ''}<question>\n${message}\n</question>`;
  const out = await writer({ system: `${ASSISTANT_SYSTEM}\n\n${voiceAddendum(voice)}`, prompt });
  const { text, plan, broken } = splitPlan(out.text, refs);
  const content = broken ? `${text}\n\n（規劃內容被截斷，沒辦法讀取。請要求少一點篇數再試一次。）` : text;

  return db.transaction(async (tx) => {
    const at = new Date();
    let id = existing?.conversation.id;
    if (id) await tx.update(aiConversations).set({ updatedAt: at }).where(eq(aiConversations.id, id));
    else [{ id }] = await tx.insert(aiConversations).values({ workspaceId: a.workspaceId, userId: a.userId, title: message.split('\n')[0]!.slice(0, 40) }).returning({ id: aiConversations.id }) as [{ id: string }];
    await tx.insert(aiMessages).values({ conversationId: id!, role: 'user', content: message, createdAt: at });
    // A moment later, so the answer always sorts after its question.
    await tx.insert(aiMessages).values({ conversationId: id!, role: 'assistant', content: content || '（沒有回覆內容）', plan: plan?.length ? plan : null, createdAt: new Date(at.getTime() + 1) });
    await tx.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'ai.used', detail: { kind: 'assistant', model: out.model ?? null, input: out.usage.input, output: out.usage.output } });
    return { conversationId: id! };
  });
}

