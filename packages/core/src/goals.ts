import { and, count, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { accountPosts, auditLog, connectedAccounts, postMetrics, publishTasks, type Db } from './db/index';
import { weekStart } from './overview';
import { zonedTimeToUtc } from './time';

export class GoalError extends Error {}

export const GOAL_MAX = 21;
// Enough posts with numbers that one hour's average is not a single lucky post.
const HISTORY_MIN = 10;
// Our own starting points until an account has history; not research.
const DEFAULT_HOUR = { facebook: 20, instagram: 21, line: 12 } as const;

type Platform = keyof typeof DEFAULT_HOUR;

/**
 * Set how many posts a week an account aims for, or clear it with null.
 *
 * Raises:
 *   GoalError: the goal is not a whole number from 1 to 21, or the account is not in the workspace.
 */
export async function setPostingGoal(db: Db, a: { workspaceId: string; accountId: string; goal: number | null; actor: string }) {
  if (a.goal !== null && (!Number.isInteger(a.goal) || a.goal < 1 || a.goal > GOAL_MAX)) throw new GoalError(`每週目標請填 1 到 ${GOAL_MAX} 篇。`);
  const [row] = await db.update(connectedAccounts).set({ postingGoal: a.goal })
    .where(and(eq(connectedAccounts.id, a.accountId), eq(connectedAccounts.workspaceId, a.workspaceId)))
    .returning({ name: connectedAccounts.name });
  if (!row) throw new GoalError('找不到這個帳號，請重新整理後再試。');
  await db.insert(auditLog).values({ workspaceId: a.workspaceId, actor: a.actor, action: 'account.goal_set', target: a.accountId, detail: { name: row.name, goal: a.goal } });
}

const hourIn = (at: Date, timeZone: string) => Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at));

/**
 * The hour, on the account's clock, its posts have done best at: the highest average
 * engagements over posts sent here and posts read back from the account. Accounts with
 * fewer than 10 such posts get our default for the platform instead.
 */
export async function bestHour(db: Db, a: { accountId: string; timeZone: string; platform: Platform }): Promise<{ hour: number; source: 'history' | 'default'; posts: number }> {
  const [sent, imported] = await Promise.all([
    db.select({ at: publishTasks.finishedAt, engagements: postMetrics.engagements }).from(publishTasks).innerJoin(postMetrics, eq(postMetrics.taskId, publishTasks.id))
      .where(and(eq(publishTasks.accountId, a.accountId), eq(publishTasks.status, 'published'), isNotNull(postMetrics.engagements))),
    db.select({ at: accountPosts.publishedAt, engagements: accountPosts.engagements }).from(accountPosts)
      .where(and(eq(accountPosts.accountId, a.accountId), isNotNull(accountPosts.engagements))),
  ]);
  const points = [...sent, ...imported].filter((p): p is { at: Date; engagements: number } => p.at !== null && p.engagements !== null);
  if (points.length < HISTORY_MIN) return { hour: DEFAULT_HOUR[a.platform], source: 'default', posts: points.length };
  const byHour = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const h = hourIn(p.at, a.timeZone);
    const b = byHour.get(h) ?? { sum: 0, n: 0 };
    byHour.set(h, { sum: b.sum + p.engagements, n: b.n + 1 });
  }
  const [hour] = [...byHour].sort(([ha, x], [hb, y]) => y.sum / y.n - x.sum / x.n || ha - hb)[0]!;
  return { hour, source: 'history', posts: points.length };
}

/** Posts the account published since the start of this week on its own clock. */
export async function publishedThisWeek(db: Db, a: { accountId: string; timeZone: string; now?: Date }) {
  const since = weekStart(a.now ?? new Date(), a.timeZone);
  const [row] = await db.select({ n: count() }).from(publishTasks)
    .where(and(eq(publishTasks.accountId, a.accountId), inArray(publishTasks.status, ['published']), gte(publishTasks.finishedAt, since)));
  return row?.n ?? 0;
}

export type Slot = { at: Date; date: string; time: string };

const localDate = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/**
 * Open times over the next seven days for a weekly goal, after Buffer's queue slots: the
 * goal's posts spread evenly across the week at `hour`, a second post on a day three
 * hours earlier, and so on. A slot is dropped when it is past, or when that day already
 * holds as many scheduled posts as the goal gives it.
 */
export function postingSlots(a: { goal: number; hour: number; timeZone: string; now: Date; scheduled: Date[] }): Slot[] {
  const perDay = new Map<number, number>();
  for (let i = 0; i < a.goal; i++) {
    const day = Math.floor((i * 7) / a.goal);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const taken = new Map<string, number>();
  for (const at of a.scheduled) taken.set(localDate(at, a.timeZone), (taken.get(localDate(at, a.timeZone)) ?? 0) + 1);
  const slots: Slot[] = [];
  // Days are counted on the calendar, not in 24-hour steps, which skip or repeat a date
  // across a daylight-saving change.
  const [y, m, d] = localDate(a.now, a.timeZone).split('-').map(Number);
  for (const [day, n] of perDay) {
    const date = new Date(Date.UTC(y!, m! - 1, d! + day)).toISOString().slice(0, 10);
    const open = n - (taken.get(date) ?? 0);
    for (let j = 0; j < open; j++) {
      const hour = Math.max(8, a.hour - 3 * j);
      const time = `${String(hour).padStart(2, '0')}:00`;
      const at = zonedTimeToUtc(date, time, a.timeZone);
      if (at.getTime() > a.now.getTime()) slots.push({ at, date, time });
    }
  }
  return slots.sort((x, y) => x.at.getTime() - y.at.getTime());
}
