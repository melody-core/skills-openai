/**
 * SKILL.md YAML frontmatter 解析
 */

import yaml from 'js-yaml';

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

export function parseFrontmatter(content: string): [Record<string, unknown>, string] {
  const trimmed = content.trim();
  const match = trimmed.match(FRONTMATTER_REGEX);
  if (!match) {
    return [{}, trimmed];
  }
  const frontmatterStr = match[1];
  const body = match[2].trim();
  try {
    const frontmatter = yaml.load(frontmatterStr) as Record<string, unknown>;
    if (frontmatter == null || typeof frontmatter !== 'object') {
      return [{}, body];
    }
    return [frontmatter, body];
  } catch (e) {
    throw new Error(`Invalid YAML frontmatter: ${e}`);
  }
}
