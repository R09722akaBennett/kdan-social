import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { GoogleAuth, type AuthClient } from 'google-auth-library';
import { mask } from '../platforms/http';
import { AiError, type Writer } from './writer';

// Posts are short; this caps the cost of a runaway answer, not a real post. Gemini's
// thinking tokens count against its output limit, so it gets more room.
const MAX_TOKENS = 4000;
const GEMINI_MAX_TOKENS = 8000;

/**
 * Where a model runs, from a spec like `vertex/gemini-4-argon`, `vertex/claude-opus-5-5`,
 * `vertex/xai/grok-4` or `anthropic/claude-opus-5-5`.
 *
 * Raises:
 *   AiError: the spec names no known provider or no model.
 */
export function parseSpec(spec: string) {
  const [provider, ...rest] = spec.trim().split('/');
  const model = rest.join('/');
  if (!model) throw new AiError('AI 模型設定不完整，請聯絡管理員。');
  if (provider === 'anthropic') return { kind: 'anthropic' as const, model };
  if (provider !== 'vertex') throw new AiError('不認得這個 AI 服務，請聯絡管理員。');
  if (model.startsWith('claude-')) return { kind: 'vertex-claude' as const, model };
  if (model.startsWith('gemini-')) return { kind: 'vertex-gemini' as const, model };
  // Partner models (xAI Grok and others) are served through Vertex's OpenAI-compatible endpoint.
  if (model.includes('/')) return { kind: 'vertex-openai' as const, model };
  throw new AiError('不認得這個 Vertex 模型，請聯絡管理員。');
}

export type GcpConfig = { projectId: string; location: string; credentialsJson?: string };

/** GCP settings from the environment; credentials fall back to Application Default Credentials. */
export function gcpConfig(env = process.env): GcpConfig | null {
  const projectId = env.GCP_PROJECT_ID;
  if (!projectId) return null;
  return { projectId, location: env.GCP_LOCATION || 'global', credentialsJson: env.GCP_SERVICE_ACCOUNT_JSON };
}

let auth: GoogleAuth | null = null;
// One GoogleAuth per process, so its cached access token is reused across requests.
function googleAuth(gcp: GcpConfig) {
  auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'], ...(gcp.credentialsJson ? { credentials: JSON.parse(gcp.credentialsJson) } : {}) });
  return auth;
}

const host = (location: string) => (location === 'global' ? 'https://aiplatform.googleapis.com' : `https://${location}-aiplatform.googleapis.com`);

/** Claude's reply as text, refusing to pass on a declined answer. */
export function fromClaude(res: Anthropic.Message) {
  if (res.stop_reason === 'refusal') throw new AiError('AI 無法處理這段內容，請換個說法再試。');
  return { text: res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim(), usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

/** Gemini's reply as text; a blocked prompt or a safety stop is a refusal. */
export function fromGemini(res: Pick<GenerateContentResponse, 'text' | 'promptFeedback' | 'candidates' | 'usageMetadata'>) {
  const reason = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason || reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST') {
    throw new AiError('AI 無法處理這段內容，請換個說法再試。');
  }
  return { text: (res.text ?? '').trim(), usage: { input: res.usageMetadata?.promptTokenCount ?? 0, output: res.usageMetadata?.candidatesTokenCount ?? 0 } };
}

type ChatCompletion = { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };

/** An OpenAI-style chat completion as text; a content filter stop is a refusal. */
export function fromChatCompletion(res: ChatCompletion) {
  const choice = res.choices?.[0];
  if (choice?.finish_reason === 'content_filter') throw new AiError('AI 無法處理這段內容，請換個說法再試。');
  return { text: (choice?.message?.content ?? '').trim(), usage: { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 } };
}

/** Turn a provider failure into the message the user sees; the cause goes to the log, masked. */
function failed(e: unknown, model: string): never {
  if (e instanceof AiError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`AI request to ${model} failed: ${mask(msg)}`);
  const status = (e as { status?: number; code?: number }).status ?? (e as { code?: number }).code;
  if (status === 429) throw new AiError('AI 目前太忙，請過一分鐘再試。');
  if (status === 401 || status === 403) throw new AiError('AI 的憑證無效或沒有權限，請聯絡管理員。');
  if (status === 404) throw new AiError('找不到設定的 AI 模型，請聯絡管理員確認模型名稱與區域。');
  throw new AiError('暫時連不到 AI，請稍後再試。');
}

export type ProviderDeps = { fetch?: typeof fetch; token?: () => Promise<string>; authClient?: () => Promise<AuthClient>; gemini?: (req: { model: string; system: string; prompt: string }) => Promise<GenerateContentResponse> };

/**
 * A writer for one model spec.
 *
 * Raises (from the returned function):
 *   AiError: credentials or settings are missing, the model declined, it is rate
 *     limited, unreachable or unknown, or it returned no text.
 */
export function providerWriter(spec: string, deps: ProviderDeps = {}, env = process.env): Writer {
  const target = parseSpec(spec);
  const gcp = gcpConfig(env);
  const token = deps.token ?? (async () => {
    const t = await googleAuth(gcp!).getAccessToken();
    if (!t) throw new AiError('取不到 GCP 存取權杖，請聯絡管理員。');
    return t;
  });

  return async ({ system, prompt }) => {
    if (target.kind !== 'anthropic' && !gcp) throw new AiError('這個環境還沒有設定 GCP，請聯絡管理員。');
    if (target.kind === 'anthropic' && !env.ANTHROPIC_API_KEY) throw new AiError('這個環境還沒有設定 AI，請聯絡管理員。');
    let out: { text: string; usage: { input: number; output: number } };
    try {
      if (target.kind === 'anthropic') {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: deps.fetch });
        const res = await client.beta.messages.create({
          model: target.model, max_tokens: MAX_TOKENS,
          // Rewriting a short post needs little reasoning; low effort keeps it quick.
          output_config: { effort: 'low' },
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          system, messages: [{ role: 'user', content: prompt }],
        });
        out = fromClaude(res as unknown as Anthropic.Message);
      } else if (target.kind === 'vertex-claude') {
        // Vertex has no server-side fallback, so a refusal is reported as is. The SDK takes
        // its token from `authClient` and ignores `accessToken`, so pass ours explicitly or it
        // falls back to whatever default Google credentials the machine has.
        const authClient = await (deps.authClient ?? (() => googleAuth(gcp!).getClient()))();
        const client = new AnthropicVertex({ projectId: gcp!.projectId, region: gcp!.location, authClient, fetch: deps.fetch });
        const res = await client.messages.create({ model: target.model, max_tokens: MAX_TOKENS, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: prompt }] });
        out = fromClaude(res);
      } else if (target.kind === 'vertex-gemini') {
        const res = deps.gemini
          ? await deps.gemini({ model: target.model, system, prompt })
          : await new GoogleGenAI({ vertexai: true, project: gcp!.projectId, location: gcp!.location, ...(gcp!.credentialsJson ? { googleAuthOptions: { credentials: JSON.parse(gcp!.credentialsJson) } } : {}) })
            .models.generateContent({ model: target.model, contents: prompt, config: { systemInstruction: system, maxOutputTokens: GEMINI_MAX_TOKENS } });
        out = fromGemini(res);
      } else {
        const res = await (deps.fetch ?? fetch)(`${host(gcp!.location)}/v1/projects/${gcp!.projectId}/locations/${gcp!.location}/endpoints/openapi/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: target.model, max_tokens: MAX_TOKENS, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
        });
        if (!res.ok) throw Object.assign(new Error(`${res.status} ${await res.text()}`), { status: res.status });
        out = fromChatCompletion(await res.json() as ChatCompletion);
      }
    } catch (e) {
      failed(e, spec);
    }
    if (!out.text) throw new AiError('AI 沒有產生內容，請再試一次。');
    return { ...out, model: spec };
  };
}
