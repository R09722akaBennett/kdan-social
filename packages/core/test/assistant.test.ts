import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { aiConversations, aiMessages, auditLog, connectedAccounts } from '../src/db/index';
import { AiError, askAssistant, deleteConversation, getConversation, listConversations, planItem, splitPlan, workspaceDigest, type Writer } from '../src/ai/index';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const other = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-10-21T02:00:00Z');

function fakeWriter(...answers: string[]) {
  const calls: Array<{ system: string; prompt: string }> = [];
  const writer: Writer = async (req) => { calls.push(req); return { text: answers.shift() ?? '好的。', usage: { input: 10, output: 5 }, model: 'fake' }; };
  return { writer, calls };
}

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const add = async (platform: 'facebook' | 'instagram', externalId: string, name: string, status: 'active' | 'expired' = 'active') => {
    const ref = { workspaceId: ws.id, platform, externalId };
    const [a] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Tokyo', name, status, credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
    return a!.id;
  };
  const fb = await add('facebook', 'p1', 'KDAN 日本');
  const ig = await add('instagram', 'i1', '@kdan_jp');
  const gone = await add('instagram', 'i2', '@kdan_old', 'expired');
  return { db, ws, fb, ig, gone, base: { workspaceId: ws.id, userId: owner.userId, actor: owner.email, now } };
}

const refs = [
  { ref: 'A1', id: 'fb', name: 'KDAN 日本', platform: 'facebook', status: 'active' },
  { ref: 'A2', id: 'ig', name: '@kdan_jp', platform: 'instagram', status: 'active' },
  { ref: 'A3', id: 'old', name: '@kdan_old', platform: 'instagram', status: 'expired' },
];

describe('splitPlan', () => {
  it('keeps valid posts on active accounts and drops the rest', () => {
    const reply = '排好了。\n```plan\n[' + [
      '{"date":"2026-11-03","time":"21:00","accounts":["A1","A2","A2"],"topic":"年末セール","body":"本文"}',
      '{"date":"2026-11-04","time":"25:00","accounts":["A1"],"topic":"bad time","body":"x"}',
      '{"date":"2026-11-05","time":"12:00","accounts":["A3","A9"],"topic":"no live account","body":"x"}',
    ].join(',') + ']\n```';
    expect(splitPlan(reply, refs)).toEqual({ text: '排好了。', broken: false, plan: [{ date: '2026-11-03', time: '21:00', accountIds: ['fb', 'ig'], topic: '年末セール', body: '本文' }] });
  });

  it('reports a plan cut off by the output limit, and passes plain answers through', () => {
    expect(splitPlan('好的\n```plan\n[{"date":"2026-11-03","ti', refs)).toEqual({ text: '好的', plan: null, broken: true });
    expect(splitPlan('  只有文字  ', refs)).toEqual({ text: '只有文字', plan: null, broken: false });
    expect(splitPlan('A1 和 A2 表現最好，A9 不認得，A10x 不動', refs).text).toBe('「KDAN 日本」 和 「@kdan_jp」 表現最好，A9 不認得，A10x 不動');
  });
});

describe('workspaceDigest', () => {
  it('lists accounts by ref with their state, and says when there is no data', async () => {
    const { db, ws } = await setup();
    const { text, refs: r } = await workspaceDigest(db, ws.id, now);
    expect(r.map((x) => x.ref)).toEqual(['A1', 'A2', 'A3']);
    expect(text).toContain('- A1: KDAN 日本, facebook, no group, Asia/Tokyo, no snapshot yet, active');
    expect(text).toContain('A3 authorization expired');
    expect(text).not.toContain('credentials');
  });
});

describe('askAssistant', () => {
  it('starts a conversation, keeps the plan, and sends the history on the next turn', async () => {
    const { db, base, fb, ig } = await setup();
    const { writer, calls } = fakeWriter('建議週二 21:00。\n```plan\n[{"date":"2026-11-03","time":"21:00","accounts":["A1","A2"],"topic":"年末","body":"年末セール"}]\n```', '可以，改成週四。');
    const { conversationId } = await askAssistant(db, writer, { ...base, message: '幫我排下週日本的貼文\n每週 3 篇' });
    expect(calls[0]!.prompt).toContain('<workspace_data>');
    expect(calls[0]!.prompt).toContain('<question>\n幫我排下週日本的貼文\n每週 3 篇\n</question>');
    expect(calls[0]!.system).toContain('# Brand voice');

    await askAssistant(db, writer, { ...base, conversationId, message: '改週四' });
    expect(calls[1]!.prompt).toContain('<assistant>\n建議週二 21:00。\n[proposed 1 posts: 2026-11-03 21:00 年末]');

    const c = await getConversation(db, { workspaceId: base.workspaceId, userId: owner.userId, id: conversationId });
    expect(c!.conversation.title).toBe('幫我排下週日本的貼文');
    expect(c!.messages.map((m) => [m.role, m.content])).toEqual([['user', '幫我排下週日本的貼文\n每週 3 篇'], ['assistant', '建議週二 21:00。'], ['user', '改週四'], ['assistant', '可以，改成週四。']]);
    const item = await planItem(db, { workspaceId: base.workspaceId, userId: owner.userId, messageId: c!.messages[1]!.id, index: 0 });
    expect(item).toEqual({ date: '2026-11-03', time: '21:00', accountIds: [fb, ig], topic: '年末', body: '年末セール' });
    expect((await db.select().from(auditLog)).filter((r) => r.action === 'ai.used')).toHaveLength(2);
  });

  it('keeps each member\'s conversations to themselves', async () => {
    const { db, base } = await setup();
    const { conversationId } = await askAssistant(db, fakeWriter().writer, { ...base, message: '你好' });
    const mine = await getConversation(db, { workspaceId: base.workspaceId, userId: owner.userId, id: conversationId });
    const msg = mine!.messages[1]!.id;
    expect(await getConversation(db, { workspaceId: base.workspaceId, userId: other, id: conversationId })).toBeNull();
    expect(await listConversations(db, { workspaceId: base.workspaceId, userId: other })).toEqual([]);
    expect(await planItem(db, { workspaceId: base.workspaceId, userId: other, messageId: msg, index: 0 })).toBeNull();
    await expect(askAssistant(db, fakeWriter().writer, { ...base, userId: other, conversationId, message: '偷看' })).rejects.toThrow(/找不到這段對話/);
    await deleteConversation(db, { workspaceId: base.workspaceId, userId: other, id: conversationId });
    expect(await listConversations(db, { workspaceId: base.workspaceId, userId: owner.userId })).toHaveLength(1);
    await deleteConversation(db, { workspaceId: base.workspaceId, userId: owner.userId, id: conversationId });
    expect(await db.select().from(aiMessages)).toEqual([]);
  });

  it('saves nothing when the question is refused or the AI fails', async () => {
    const { db, base } = await setup();
    await expect(askAssistant(db, fakeWriter().writer, { ...base, message: '  ' })).rejects.toThrow(AiError);
    await expect(askAssistant(db, fakeWriter().writer, { ...base, message: 'x'.repeat(2001) })).rejects.toThrow(/2000/);
    const failing: Writer = async () => { throw new AiError('AI 暫時無法回覆'); };
    await expect(askAssistant(db, failing, { ...base, message: '你好' })).rejects.toThrow('AI 暫時無法回覆');
    expect(await db.select().from(aiConversations)).toEqual([]);
  });
});
