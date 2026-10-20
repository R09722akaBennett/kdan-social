// Pure helpers with no server dependencies, so the browser composer can import them too.

/**
 * The banned words that appear in `text`, case-insensitively, each once.
 *
 * A word containing a parenthesised note, like "免費（沒附條件時）", is matched on the
 * part before the note; the note is guidance for people and for the AI.
 */
export function bannedHits(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set(banned.filter((w) => {
    const core = w.replace(/[（(].*$/, '').trim().toLowerCase();
    return core.length > 0 && lower.includes(core);
  }))];
}
