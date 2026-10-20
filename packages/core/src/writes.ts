/**
 * Whether a publish may reach a real platform.
 *
 * Two switches, both off unless set: `PUBLISHING_ENABLED=1` for the whole deployment
 * (the operator's kill switch) and `publishing_enabled` on each workspace (the
 * customer's). A workspace cannot publish while the deployment switch is off. A
 * publish that is not allowed still runs to the end and is recorded as `dry_run`,
 * so the calendar shows what would have gone out.
 *
 * Unlike devflow, where switches default on, these default off: here a write lands
 * on a customer's public page, and a staging deployment or a new workspace must not
 * post anything until someone decides it should.
 */
export const GLOBAL_SWITCH_ENV = 'PUBLISHING_ENABLED';

export function globalPublishingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[GLOBAL_SWITCH_ENV] === '1';
}

export function publishingAllowed(globalEnabled: boolean, workspace: { publishingEnabled: boolean }): boolean {
  return globalEnabled && workspace.publishingEnabled;
}
