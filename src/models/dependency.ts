/**
 * Skill 依赖配置
 */

export interface SkillDependency {
  python: string[];
  system: string[];
}

export function createSkillDependency(data: Record<string, unknown> | null | undefined): SkillDependency {
  if (!data || typeof data !== 'object') {
    return { python: [], system: [] };
  }
  const python = Array.isArray(data.python) ? (data.python as string[]) : [];
  const system = Array.isArray(data.system) ? (data.system as string[]) : [];
  return { python, system };
}

export function hasDependencies(dep: SkillDependency): boolean {
  return dep.python.length > 0 || dep.system.length > 0;
}

export function getPipInstallCommand(dep: SkillDependency): string | null {
  if (dep.python.length === 0) return null;
  return `pip install ${dep.python.map((p) => `"${p}"`).join(' ')}`;
}
