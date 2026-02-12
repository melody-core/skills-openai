/**
 * Skill 元数据 - Layer 1（始终加载）
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  triggers: string[];
  author?: string;
  tags: string[];
}

export function createSkillMetadata(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  return {
    name: '',
    description: '',
    version: '1.0.0',
    triggers: [],
    tags: [],
    ...overrides,
  };
}

export function matchesQuery(metadata: SkillMetadata, query: string): boolean {
  const queryLower = query.toLowerCase();
  for (const trigger of metadata.triggers) {
    if (trigger.toLowerCase().includes(queryLower) || queryLower.includes(trigger.toLowerCase())) {
      return true;
    }
  }
  if (metadata.name.toLowerCase().includes(queryLower) || queryLower.includes(metadata.name.toLowerCase())) {
    return true;
  }
  const descWords = metadata.description.toLowerCase().split(/\s+/);
  for (const word of descWords) {
    if (word.length > 3 && queryLower.includes(word)) return true;
  }
  return false;
}
