// Shared by the sign-up form, which ticks each rule as it is met, and the server, which
// refuses a password that breaks one. Supabase only enforces the minimum length.
export const PASSWORD_RULES = [
  { key: 'length', text: '至少 8 個字元', test: (p: string) => p.length >= 8 },
  { key: 'upper', text: '包含 1 個大寫英文字母', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'digit', text: '包含 1 個數字或符號', test: (p: string) => /[^A-Za-z]/.test(p) },
] as const;

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
