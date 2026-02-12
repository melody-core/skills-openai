/**
 * Skill - 三层渐进式披露的完整 Skill 对象
 */

import type { SkillMetadata } from '../models/metadata';
import type { SkillInstruction } from '../models/instruction';
import type { SkillResources, Reference, Script } from '../models/resource';
import { isReferenceLoaded, getInvocationHint } from '../models/resource';
import * as path from 'path';

export interface Skill {
  metadata: SkillMetadata;
  instruction?: SkillInstruction;
  resources: SkillResources;
  sourcePath: string | null;
}

export function getSkillName(skill: Skill): string {
  return skill.metadata.name;
}

export function getSkillDescription(skill: Skill): string {
  return skill.metadata.description;
}

export function isInstructionLoaded(skill: Skill): boolean {
  return skill.instruction != null;
}

export function getReferences(skill: Skill): Reference[] {
  return skill.resources.references;
}

export function getScripts(skill: Skill): Script[] {
  return skill.resources.scripts;
}

export function getBasePath(skill: Skill): string | null {
  return skill.sourcePath ? path.dirname(skill.sourcePath) : null;
}

export function resolveReferencePath(skill: Skill, ref: Reference): string | null {
  const base = getBasePath(skill);
  if (!base) return null;
  return path.resolve(base, ref.path);
}

export function resolveScriptPath(skill: Skill, script: Script): string | null {
  const base = getBasePath(skill);
  if (!base) return null;
  return path.resolve(base, script.path);
}

export function getSystemPrompt(skill: Skill, includeResources = false): string {
  const parts: string[] = [];
  if (skill.instruction) {
    parts.push(skill.instruction.content);
  }
  if (skill.resources.scripts.length > 0) {
    parts.push('\n## Available Actions\n');
    for (const script of skill.resources.scripts) {
      parts.push(`- ${getInvocationHint(script)}`);
    }
  }
  if (includeResources) {
    for (const ref of skill.resources.references) {
      if (isReferenceLoaded(ref) && ref.content) {
        parts.push(`\n## Reference: ${ref.path}\n\n${ref.content}`);
      }
    }
  }
  return parts.join('\n');
}

export function toSummary(skill: Skill): Record<string, unknown> {
  return {
    name: getSkillName(skill),
    description: getSkillDescription(skill),
    version: skill.metadata.version,
    triggers: skill.metadata.triggers,
    has_instruction: isInstructionLoaded(skill),
    reference_count: skill.resources.references.length,
    script_count: skill.resources.scripts.length,
    source: skill.sourcePath ?? null,
  };
}
