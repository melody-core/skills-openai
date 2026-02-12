/**
 * Skill 资源 - Layer 3（按条件加载）
 */

export enum ReferenceMode {
  EXPLICIT = 'explicit',
  IMPLICIT = 'implicit',
  ALWAYS = 'always',
}

export interface Reference {
  path: string;
  condition?: string;
  description?: string;
  mode: ReferenceMode;
  content?: string | null;
}

export interface Script {
  name: string;
  path: string;
  description: string;
  args: string[];
  timeout: number;
  sandbox: boolean;
  outputs: string[];
}

export interface SkillResources {
  references: Reference[];
  scripts: Script[];
  dependency: { python: string[]; system: string[] };
}

export function isReferenceLoaded(ref: Reference): boolean {
  return ref.content != null;
}

export function shouldLoadReference(ref: Reference, _context: string): boolean {
  if (ref.mode === ReferenceMode.ALWAYS) return true;
  return false;
}

export function getInvocationHint(script: Script): string {
  const argsHint = script.args.length ? ` with arguments: ${script.args.join(', ')}` : '';
  return `To ${script.description.toLowerCase()}, invoke the '${script.name}' script${argsHint}.`;
}
