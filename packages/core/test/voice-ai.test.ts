import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accountContext, encrypt } from '../src/crypto';
import { auditLog, connectedAccounts } from '../src/db/index';
import { aiAdapt, AiError, aiInsights, aiRewrite, aiSamples, type Writer } from '../src/ai/index';
import { saveGroup } from '../src/groups';
import { DEFAULT_VOICE, getGroupVoices, getVoice, saveVoice, VoiceError } from '../src/voice';
import { bannedHits } from '../src/voice-rules';
import { bootstrapWorkspace } from '../src/workspace';
import { KEY, testDb } from './helpers';

const owner = { userId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
const by = { actor: owner.email, role: 'owner' as const };

/** A writer that records every request and answers with a fixed text. */
function fakeWriter(answer = '改好的貼文') {
  const calls: Array<{ system: string; prompt: string }> = [];
  const writer: Writer = async (req) => { calls.push(req); return { text: answer, usage: { input: 10, output: 5 } }; };
  return { writer, calls };
}

async function setup() {
  const db = await testDb();
  const ws = await bootstrapWorkspace(db, { name: 'KDAN', owner });
  const ref = { workspaceId: ws.id, platform: 'instagram' as const, externalId: 'ig-jp' };
  const [acc] = await db.insert(connectedAccounts).values({ ...ref, timeZone: 'Asia/Tokyo', name: '@kdan_jp', credentials: encrypt('{}', KEY, accountContext(ref)) }).returning();
  const jp = await saveGroup(db, { workspaceId: ws.id, name: '日本', accountIds: [acc!.id], ...by });
  return { db, ws, accountId: acc!.id, jp };
}

describe('bannedHits', () => {
  it('matches case-insensitively and ignores the note in parentheses', () => {
    expect(bannedHits('史上最低價，100% 免費送', ['史上最', '免費（沒附條件時）', '保證', 'FREE'])).toEqual(['史上最', '免費（沒附條件時）']);
    expect(bannedHits('Totally free', ['FREE'])).toEqual(['FREE']);
  });
});

describe('brand voice', () => {
  it('returns defaults until saved, then the cleaned settings and group rules', async () => {
    const { db, ws, jp } = await setup();
    expect(await getVoice(db, ws.id)).toEqual(DEFAULT_VOICE);
    await saveVoice(db, {
      workspaceId: ws.id, ...by,
      voice: { about: ' 可靠的同事 ', formality: 140, persuasion: -3, emoji: 'none', banned: ['史上最', ' 史上最 ', ''], glossary: [{ term: 'PDF Reader', rule: '不翻譯' }, { term: ' ', rule: 'x' }] },
      groups: { [jp]: { rules: 'です・ます調', examples: ['例 1', '例 1', ' '] } },
    });
    expect(await getVoice(db, ws.id)).toEqual({ about: '可靠的同事', formality: 100, persuasion: 0, emoji: 'none', banned: ['史上最'], glossary: [{ term: 'PDF Reader', rule: '不翻譯' }] });
    expect((await getGroupVoices(db, ws.id)).get(jp)).toEqual({ rules: 'です・ます調', examples: ['例 1'] });
  });

  it('refuses editors and groups from another workspace', async () => {
    const { db, ws } = await setup();
    await expect(saveVoice(db, { workspaceId: ws.id, actor: 'x', role: 'editor', voice: DEFAULT_VOICE })).rejects.toThrow(VoiceError);
    const other = await bootstrapWorkspace(db, { name: 'Other', owner: { userId: '00000000-0000-4000-8000-000000000002', email: 'x@example.com' } });
    const foreign = await saveGroup(db, { workspaceId: other.id, name: 'X', accountIds: [], actor: 'x', role: 'owner' });
    await expect(saveVoice(db, { workspaceId: ws.id, ...by, voice: DEFAULT_VOICE, groups: { [foreign]: { rules: 'x', examples: [] } } })).rejects.toThrow(/找不到/);
  });
});

describe('AI', () => {
  it('rewrites with the brand voice layered on the fixed base prompt, and logs usage', async () => {
    const { db, ws } = await setup();
    await saveVoice(db, { workspaceId: ws.id, ...by, voice: { ...DEFAULT_VOICE, banned: ['史上最'], glossary: [{ term: 'PDF Reader', rule: '不翻譯' }] } });
    const { writer, calls } = fakeWriter('史上最划算的 PDF Reader');
    const out = await aiRewrite(db, writer, { workspaceId: ws.id, actor: 'a', action: 'shorten', text: 'PDF Reader 全方案 5 折' });
    expect(out).toEqual({ text: '史上最划算的 PDF Reader', banned: ['史上最'] });
    expect(calls[0]!.system).toMatch(/^You write social media posts/);
    expect(calls[0]!.system).toContain('Banned words: 史上最');
    expect(calls[0]!.system).toContain('- PDF Reader: 不翻譯');
    expect(calls[0]!.prompt).toContain('<post>\nPDF Reader 全方案 5 折\n</post>');
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'ai.used')))[0]!.detail).toMatchObject({ kind: 'rewrite:shorten', input: 10, output: 5 });
  });

  it('adapts for one account with its platform format and its group’s rules', async () => {
    const { db, ws, accountId, jp } = await setup();
    await saveVoice(db, { workspaceId: ws.id, ...by, voice: DEFAULT_VOICE, groups: { [jp]: { rules: '日本語で書く', examples: [] } } });
    const { writer, calls } = fakeWriter();
    await aiAdapt(db, writer, { workspaceId: ws.id, actor: 'a', accountId, text: '雙十一預告' });
    expect(calls[0]!.system).toContain('# Rules for the account group "日本"');
    expect(calls[0]!.system).toContain('日本語で書く');
    expect(calls[0]!.prompt).toMatch(/Instagram caption/);
  });

  it('samples once for the brand and once per group that has rules, using unsaved settings', async () => {
    const { db, ws, jp } = await setup();
    const { writer, calls } = fakeWriter();
    const out = await aiSamples(db, writer, { workspaceId: ws.id, actor: 'a', topic: '雙十一', voice: { ...DEFAULT_VOICE, about: '草稿中的介紹' }, groups: [{ id: jp, name: '日本', voice: { rules: '日本語', examples: [] } }, { id: 'x', name: '空的', voice: { rules: ' ', examples: [] } }] });
    expect(out.map((o) => o.name)).toEqual(['品牌', '日本']);
    expect(calls.every((c) => c.system.includes('草稿中的介紹'))).toBe(true);
  });

  it('refuses empty or oversized text, foreign accounts, and runs past the hourly cap', async () => {
    const { db, ws } = await setup();
    const { writer } = fakeWriter();
    await expect(aiRewrite(db, writer, { workspaceId: ws.id, actor: 'a', action: 'rephrase', text: '  ' })).rejects.toThrow(/先寫一些內容/);
    await expect(aiRewrite(db, writer, { workspaceId: ws.id, actor: 'a', action: 'rephrase', text: 'x'.repeat(5001) })).rejects.toThrow(/超過 5000 字/);
    await expect(aiRewrite(db, writer, { workspaceId: ws.id, actor: 'a', action: 'ask', text: 'x' })).rejects.toThrow(/想怎麼改/);
    await expect(aiAdapt(db, writer, { workspaceId: ws.id, actor: 'a', accountId: '00000000-0000-4000-8000-0000000000ff', text: 'x' })).rejects.toThrow(/找不到/);
    await db.insert(auditLog).values(Array.from({ length: 200 }, () => ({ workspaceId: ws.id, actor: 'a', action: 'ai.used' })));
    await expect(aiRewrite(db, writer, { workspaceId: ws.id, actor: 'a', action: 'rephrase', text: 'x' })).rejects.toThrow(AiError);
  });
});

describe('AI insights', () => {
  it('summarises only the page’s numbers and refuses when there are none', async () => {
    const { db, ws, accountId } = await setup();
    const { writer, calls } = fakeWriter('- 粉絲增加 10 人（粉絲數快照）\n- 互動資料不足（貼文互動）');
    await expect(aiInsights(db, writer, { workspaceId: ws.id, actor: 'a', days: 7 })).rejects.toThrow(/還沒有足夠的數字/);
    const { followerSnapshots } = await import('../src/db/index');
    await db.insert(followerSnapshots).values([{ accountId, day: new Date().toISOString().slice(0, 10), followers: 1010 }]);
    const out = await aiInsights(db, writer, { workspaceId: ws.id, actor: 'a', days: 7 });
    expect(out).toEqual(['粉絲增加 10 人（粉絲數快照）', '互動資料不足（貼文互動）']);
    expect(calls[0]!.prompt).toContain('@kdan_jp (instagram, group 日本)');
    expect(calls[0]!.system).not.toContain('You write social media posts');
  });
});
