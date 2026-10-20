import { providerWriter } from './providers';
import { AiError, modelFor, type AiTask, type Writer } from './writer';

export * from './writer';
export * from './prompts';
export * from './service';
export { fromChatCompletion, fromClaude, fromGemini, gcpConfig, parseSpec, providerWriter } from './providers';

/**
 * The configured writer for a task.
 *
 * Raises (from the returned function):
 *   AiError: no model is configured, or the provider failed.
 */
export function aiWriter(task: AiTask = 'write'): Writer {
  const spec = modelFor(task);
  if (!spec) return async () => { throw new AiError('這個環境還沒有設定 AI，請聯絡管理員。'); };
  return providerWriter(spec);
}
