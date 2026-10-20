import { describe, expect, it } from 'vitest';
import { aiConfigured, AiError, fromChatCompletion, fromGemini, modelFor, parseSpec, providerWriter } from '../src/ai/index';
import { fakeFetch } from './helpers';

const GCP = { GCP_PROJECT_ID: 'kdan-prod', GCP_LOCATION: 'us-east5' } as NodeJS.ProcessEnv;
const req = { system: 'sys', prompt: 'hello' };
const token = async () => 'gcp-token';
// Stands in for google-auth-library, so no test can reach this machine's real Google credentials.
const authClient = async () => ({ projectId: 'kdan-prod', getRequestHeaders: async () => new Headers({ Authorization: 'Bearer gcp-token' }) }) as never;

describe('model config', () => {
  it('routes each spec to its provider', () => {
    expect(parseSpec('vertex/claude-opus-5-5')).toEqual({ kind: 'vertex-claude', model: 'claude-opus-5-5' });
    expect(parseSpec('vertex/gemini-4-argon')).toEqual({ kind: 'vertex-gemini', model: 'gemini-4-argon' });
    expect(parseSpec('vertex/xai/grok-4')).toEqual({ kind: 'vertex-openai', model: 'xai/grok-4' });
    expect(parseSpec('anthropic/claude-opus-5-5')).toEqual({ kind: 'anthropic', model: 'claude-opus-5-5' });
    expect(() => parseSpec('openai/gpt')).toThrow(AiError);
    expect(() => parseSpec('vertex/')).toThrow(/設定不完整/);
    expect(() => parseSpec('vertex/llama')).toThrow(/不認得/);
  });

  it('picks a model per task, and is configured only with credentials for it', () => {
    expect(modelFor('insights', { AI_MODEL: 'vertex/gemini-3.8-flash', AI_MODEL_INSIGHTS: 'vertex/gemini-4-argon' })).toBe('vertex/gemini-4-argon');
    expect(modelFor('write', { AI_MODEL: 'vertex/gemini-3.8-flash', AI_MODEL_INSIGHTS: 'vertex/gemini-4-argon' })).toBe('vertex/gemini-3.8-flash');
    expect(modelFor('write', { ANTHROPIC_API_KEY: 'k' })).toBe('anthropic/claude-opus-5-5');
    expect(modelFor('write', {})).toBeNull();
    expect(aiConfigured({ AI_MODEL: 'vertex/gemini-3.8-flash' })).toBe(false);
    expect(aiConfigured({ AI_MODEL: 'vertex/gemini-3.8-flash', GCP_PROJECT_ID: 'p' })).toBe(true);
  });
});

describe('Vertex providers', () => {
  it('calls Claude on Vertex with a GCP token and the regional endpoint', async () => {
    const f = fakeFetch().on('POST', /us-east5-aiplatform\.googleapis\.com\/v1\/projects\/kdan-prod\/locations\/us-east5\/publishers\/anthropic\/models\/claude-opus-5-5:rawPredict/, {
      body: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: ' 改好了 ' }], stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 4 } },
      // The SDK only parses a JSON body when the response says it is one.
      headers: { 'content-type': 'application/json' },
    });
    const out = await providerWriter('vertex/claude-opus-5-5', { fetch: f.fn, token, authClient }, GCP)(req);
    expect(out).toEqual({ text: '改好了', usage: { input: 12, output: 4 }, model: 'vertex/claude-opus-5-5' });
    expect(f.calls[0]!.headers.authorization).toBe('Bearer gcp-token');
    expect(JSON.parse(f.calls[0]!.body)).toMatchObject({ system: 'sys', messages: [{ role: 'user', content: 'hello' }] });
  });

  it('calls a partner model through the OpenAI-compatible endpoint', async () => {
    const f = fakeFetch().on('POST', /aiplatform\.googleapis\.com\/v1\/projects\/kdan-prod\/locations\/global\/endpoints\/openapi\/chat\/completions$/, {
      body: { choices: [{ message: { content: 'grok 版本' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 3 } },
    });
    const out = await providerWriter('vertex/xai/grok-4', { fetch: f.fn, token }, { GCP_PROJECT_ID: 'kdan-prod' })(req);
    expect(out.text).toBe('grok 版本');
    expect(f.calls[0]!.url.startsWith('https://aiplatform.googleapis.com/')).toBe(true);
    expect(JSON.parse(f.calls[0]!.body)).toMatchObject({ model: 'xai/grok-4', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hello' }] });
  });

  it('passes the system prompt to Gemini and reads its text and usage', async () => {
    const seen: unknown[] = [];
    const gemini = async (r: { model: string; system: string; prompt: string }) => {
      seen.push(r);
      return { text: 'Gemini 版本', candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 } } as never;
    };
    const out = await providerWriter('vertex/gemini-4-argon', { gemini }, GCP)(req);
    expect(out).toEqual({ text: 'Gemini 版本', usage: { input: 20, output: 6 }, model: 'vertex/gemini-4-argon' });
    expect(seen).toEqual([{ model: 'gemini-4-argon', system: 'sys', prompt: 'hello' }]);
  });

  it('turns refusals, missing settings and HTTP failures into messages a user can act on', async () => {
    expect(() => fromGemini({ text: '', promptFeedback: { blockReason: 'SAFETY' } } as never)).toThrow(/換個說法/);
    expect(() => fromChatCompletion({ choices: [{ finish_reason: 'content_filter' }] })).toThrow(/換個說法/);
    await expect(providerWriter('vertex/gemini-4-argon', {}, {})(req)).rejects.toThrow(/還沒有設定 GCP/);
    const cases: Array<[number, RegExp]> = [[429, /太忙/], [403, /沒有權限/], [404, /找不到設定的 AI 模型/], [500, /暫時連不到/]];
    for (const [status, msg] of cases) {
      const f = fakeFetch().on('POST', /chat\/completions$/, { status, body: { error: { message: `token=secret-${status}` } } });
      await expect(providerWriter('vertex/xai/grok-4', { fetch: f.fn, token }, GCP)(req)).rejects.toThrow(msg);
    }
    const empty = fakeFetch().on('POST', /chat\/completions$/, { body: { choices: [{ message: { content: '  ' }, finish_reason: 'stop' }] } });
    await expect(providerWriter('vertex/xai/grok-4', { fetch: empty.fn, token }, GCP)(req)).rejects.toThrow(/沒有產生內容/);
  });
});
