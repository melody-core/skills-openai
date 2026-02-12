/**
 * Skill 指令 - Layer 2（按需加载）
 */

export interface SkillInstruction {
  content: string;
  rawContent?: string;
}

export function getSystemPrompt(instruction: SkillInstruction): string {
  return instruction.content.trim();
}

export function getTokenEstimate(instruction: SkillInstruction): number {
  return Math.floor(instruction.content.length / 4);
}
