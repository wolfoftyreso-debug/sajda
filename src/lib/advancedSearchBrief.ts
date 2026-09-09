export const MAX_ADVANCED_BRIEF_WORDS = 250;

const BRIEF_WORD_PATTERN = /[\p{L}\p{N}]+/gu;

export function countAdvancedBriefWords(value: string): number {
  return value.match(BRIEF_WORD_PATTERN)?.length ?? 0;
}

export function limitAdvancedBriefWords(value: string): string {
  const words = Array.from(value.matchAll(BRIEF_WORD_PATTERN));
  if (words.length <= MAX_ADVANCED_BRIEF_WORDS) return value;

  const lastAllowedWord = words[MAX_ADVANCED_BRIEF_WORDS - 1];
  if (!lastAllowedWord || lastAllowedWord.index === undefined) return value;
  return value.slice(0, lastAllowedWord.index + lastAllowedWord[0].length);
}
