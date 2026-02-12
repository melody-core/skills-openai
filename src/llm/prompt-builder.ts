/**
 * Prompt 构建 - 将 skill 指令与资源整合进 LLM 对话
 */

import type { Skill } from '../core/skill';
import type { SkillMetadata } from '../models/metadata';
import { isReferenceLoaded } from '../models/resource';

const SCRIPT_INVOKE_REGEX = /\[INVOKE:(\w+)(?:\((.*?)\))?\]/g;

export class PromptBuilder {
  buildSkillCatalog(metadataList: SkillMetadata[]): string {
    if (metadataList.length === 0) return '';
    const lines = metadataList.map(
      (m) =>
        `- **${m.name}**: ${m.description}\n  Triggers: ${m.triggers?.length ? m.triggers.join(', ') : 'N/A'}`
    );
    return `## Available Skills\n\nYou have access to the following skills. When the user's request matches a skill, you should use it.\n\n${lines.join('\n')}\n\nTo use a skill, indicate which skill you want to use and I will provide the detailed instructions.`;
  }

  buildActiveSkillPrompt(
    skill: Skill,
    includeScripts = true,
    includeReferences = true
  ): string {
    const parts: string[] = [];
    if (skill.instruction) {
      parts.push(`## Active Skill: ${skill.metadata.name}\n\n${skill.instruction.content}`);
    } else {
      parts.push(`## Active Skill: ${skill.metadata.name}\n\n${skill.metadata.description}`);
    }
    if (includeScripts && skill.resources.scripts.length > 0) {
      const scriptLines = skill.resources.scripts.map(
        (s) => `- \`${s.name}\`: ${s.description}`
      );
      parts.push(
        `\n## Available Actions\n\nYou can invoke the following scripts when needed:\n\n${scriptLines.join('\n')}\n\nTo invoke a script, use the format: \`[INVOKE:script_name]\` with any required parameters.`
      );
    }
    if (includeReferences) {
      for (const ref of skill.resources.references) {
        if (isReferenceLoaded(ref) && ref.content) {
          parts.push(`\n## Reference: ${ref.path}\n\n${ref.content}`);
        }
      }
    }
    return parts.join('\n');
  }

  extractScriptInvocations(text: string): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    let m: RegExpExecArray | null;
    SCRIPT_INVOKE_REGEX.lastIndex = 0;
    while ((m = SCRIPT_INVOKE_REGEX.exec(text)) !== null) {
      result.push([m[1], m[2] ?? '']);
    }
    return result;
  }
}
