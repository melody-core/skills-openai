/**
 * Skill 匹配器 - 将用户查询匹配到 skills
 */

import type { SkillMetadata } from '../models/metadata';

const EXACT_TRIGGER_SCORE = 1.0;
const PARTIAL_TRIGGER_SCORE = 0.8;
const NAME_MATCH_SCORE = 0.7;
const DESCRIPTION_MATCH_SCORE = 0.5;
const TAG_MATCH_SCORE = 0.4;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'and', 'or',
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const words = text.match(/[\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) ?? [];
  for (const word of words) {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(word)) {
      tokens.push(word);
      for (let i = 0; i < word.length; i++) {
        tokens.push(word[i]);
        if (i + 1 < word.length) tokens.push(word.slice(i, i + 2));
      }
    } else {
      tokens.push(word);
    }
  }
  return tokens;
}

function extractKeywords(text: string): Set<string> {
  const words = tokenize(text.toLowerCase());
  const out = new Set<string>();
  for (const w of words) {
    if (w.length > 2 && !STOP_WORDS.has(w)) out.add(w);
  }
  return out;
}

export interface MatchResult {
  metadata: SkillMetadata;
  score: number;
  matchedBy: string;
}

export class SkillMatcher {
  minScore: number;

  constructor(minScore = 0.3) {
    this.minScore = minScore;
  }

  match(
    query: string,
    metadataList: SkillMetadata[],
    limit = 5
  ): SkillMetadata[] {
    const results: MatchResult[] = [];
    const queryLower = query.toLowerCase().trim();

    for (const metadata of metadataList) {
      const result = this.scoreMatch(queryLower, metadata);
      if (result && result.score >= this.minScore) {
        results.push(result);
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.metadata);
  }

  private scoreMatch(queryLower: string, metadata: SkillMetadata): MatchResult | null {
    let bestScore = 0;
    let matchedBy = '';

    for (const trigger of metadata.triggers) {
      const triggerLower = trigger.toLowerCase();
      if (triggerLower === queryLower) {
        return { metadata, score: EXACT_TRIGGER_SCORE, matchedBy: `exact trigger: ${trigger}` };
      }
      if (queryLower.includes(triggerLower)) {
        if (PARTIAL_TRIGGER_SCORE > bestScore) {
          bestScore = PARTIAL_TRIGGER_SCORE;
          matchedBy = `partial trigger: ${trigger}`;
        }
      }
      const triggerWords = new Set(tokenize(triggerLower));
      const queryWords = new Set(tokenize(queryLower));
      if (triggerWords.size > 0 && [...triggerWords].every((w) => queryWords.has(w))) {
        const score = PARTIAL_TRIGGER_SCORE * 0.9;
        if (score > bestScore) {
          bestScore = score;
          matchedBy = `trigger words: ${trigger}`;
        }
      }
    }

    const nameLower = metadata.name.toLowerCase().replace(/[-_]/g, ' ');
    const nameWords = new Set(tokenize(nameLower));
    const queryWords = new Set(tokenize(queryLower));
    if (queryLower.includes(nameLower) || nameLower.includes(queryLower)) {
      if (NAME_MATCH_SCORE > bestScore) {
        bestScore = NAME_MATCH_SCORE;
        matchedBy = `name: ${metadata.name}`;
      }
    } else if (nameWords.size > 0 && [...nameWords].every((w) => queryWords.has(w))) {
      const score = NAME_MATCH_SCORE * 0.9;
      if (score > bestScore) {
        bestScore = score;
        matchedBy = `name words: ${metadata.name}`;
      }
    }

    const descWords = extractKeywords(metadata.description);
    const common = [...descWords].filter((w) => queryWords.has(w));
    if (common.length > 0) {
      const ratio = common.length / Math.max(descWords.size, 1);
      const score = DESCRIPTION_MATCH_SCORE * (0.5 + ratio * 0.5);
      if (score > bestScore) {
        bestScore = score;
        matchedBy = `description keywords: ${common.join(', ')}`;
      }
    }

    for (const tag of metadata.tags) {
      if (queryLower.includes(tag.toLowerCase())) {
        if (TAG_MATCH_SCORE > bestScore) {
          bestScore = TAG_MATCH_SCORE;
          matchedBy = `tag: ${tag}`;
        }
      }
    }

    if (bestScore > 0) {
      return { metadata, score: bestScore, matchedBy };
    }
    return null;
  }

  findBestMatch(query: string, metadataList: SkillMetadata[]): SkillMetadata | null {
    const matches = this.match(query, metadataList, 1);
    return matches[0] ?? null;
  }
}
