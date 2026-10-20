// The base prompt stays fixed; everything workspace-specific is layered on in `voiceAddendum`,
// so a change in tone is a data change, not a prompt change, and the two can be compared.
import type { Platform } from '../platforms/http';
import type { GroupVoice, Voice } from '../voice';

export const BASE_SYSTEM = `You write social media posts for a brand's Facebook pages, Instagram business accounts and LINE Official Accounts.

Reply with the post text only: no preamble, no explanation, no surrounding quotes or code fences.
Keep every fact from the source exactly as given - prices, discounts, dates, times, links, product and campaign names - unless the request explicitly asks to change it. Never invent facts, offers or claims.
Write in the language of the source text unless the brand or group rules say which language these accounts use.
Follow the brand voice, group rules and glossary below. Never use any of the banned words, not even in another form.`;

const FORMALITY = (n: number) => (n < 34 ? 'formal' : n < 67 ? 'neither stiff nor chatty' : 'casual and conversational');
const PERSUASION = (n: number) => (n < 34 ? 'lead with concrete numbers and facts' : n < 67 ? 'balance facts with how it feels' : 'lead with feelings and benefits');
const EMOJI = { none: 'Do not use emoji.', few: 'Use at most one or two emoji, only where they add meaning.', many: 'Emoji are welcome where they fit.' } as const;

/** The workspace's voice, and optionally one group's added rules, as a system prompt addendum. */
export function voiceAddendum(voice: Voice, group?: { name: string; voice?: GroupVoice }) {
  const lines = ['# Brand voice'];
  if (voice.about) lines.push(voice.about);
  lines.push(`Tone: ${FORMALITY(voice.formality)}; ${PERSUASION(voice.persuasion)}. ${EMOJI[voice.emoji]}`);
  if (voice.banned.length) lines.push(`Banned words: ${voice.banned.join(', ')}`);
  if (voice.glossary.length) lines.push('Glossary (follow exactly):', ...voice.glossary.map((g) => `- ${g.term}: ${g.rule}`));
  if (group?.voice && (group.voice.rules || group.voice.examples.length)) {
    lines.push('', `# Rules for the account group "${group.name}" (these win over the brand voice when they conflict)`);
    if (group.voice.rules) lines.push(group.voice.rules);
    if (group.voice.examples.length) lines.push('Example posts from this group, for length and rhythm:', ...group.voice.examples.map((e) => `<example>\n${e}\n</example>`));
  }
  return lines.join('\n');
}

const PLATFORM_RULES: Record<Platform, string> = {
  facebook: 'Facebook page post: links are clickable, so keep them in the text; up to a few short paragraphs.',
  instagram: 'Instagram caption: at most 2,200 characters; links are not clickable, so point to the link in bio instead of pasting a URL; open with a strong first line, since only it shows before "more".',
  line: 'LINE broadcast message: short and scannable, a few lines; no hashtags; links are clickable.',
};

export type RewriteAction = 'rephrase' | 'shorten' | 'casual' | 'formal' | 'tags' | 'ask';

const ACTIONS: Record<Exclude<RewriteAction, 'ask'>, string> = {
  rephrase: 'Rewrite this post with different wording and the same meaning and length.',
  shorten: 'Make this post noticeably shorter while keeping every key fact.',
  casual: 'Rewrite this post in a more casual, conversational tone.',
  formal: 'Rewrite this post in a more formal, polished tone.',
  tags: 'Suggest 3 to 6 hashtags for this post, one per line, each followed by a short reason in parentheses written in the language of the post. Reply with the list only.',
};

/** The user turn for one of the composer's quick actions on the main text. */
export function rewritePrompt(action: RewriteAction, text: string, instruction?: string) {
  const task = action === 'ask' ? `Revise this post as follows: ${instruction ?? ''}` : ACTIONS[action];
  return `${task}\n\n<post>\n${text}\n</post>`;
}

/** The user turn for rewriting the main text for one account's platform and group. */
export function adaptPrompt(text: string, account: { name: string; platform: Platform }) {
  return `Rewrite this post for the account "${account.name}". ${PLATFORM_RULES[account.platform]}\n\n<post>\n${text}\n</post>`;
}

/** The user turn for the brand voice page's "try it" sample. */
export function samplePrompt(topic: string, platform: Platform = 'facebook') {
  return `Write one post about the following topic. ${PLATFORM_RULES[platform]}\n\n<topic>\n${topic}\n</topic>`;
}

/**
 * The user turn for summarising the analytics page. Only the numbers given are facts;
 * the model has no tools and must not reach beyond them.
 */
export function insightsPrompt(digest: string, days: number) {
  return `Below are a brand's social media numbers for the last ${days} days. Write 3 to 5 short findings for its marketing team in Traditional Chinese (Taiwan), one per line, each starting with "- ".
Use only these numbers; do not guess causes the numbers cannot show. End each finding with its source in full-width parentheses, such as （粉絲數快照）or（貼文互動）. If there is too little data to say anything useful, say so in one line.

<numbers>
${digest}
</numbers>`;
}

/** The system prompt for analytics findings; a different job from writing posts. */
export const INSIGHTS_SYSTEM = 'You are a careful social media analyst. You only state what the numbers support, and you say plainly when data is missing.';
