/**
 * SkillManager - 技能发现、加载、匹配与脚本执行
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { Skill } from './skill';
import type { SkillMetadata } from '../models/metadata';
import type { SkillInstruction } from '../models/instruction';
import type { Reference } from '../models/resource';
import { SkillParser } from './parser';
import { SkillMatcher } from './matcher';
import { ScriptExecutor } from './executor';
import { getBasePath, resolveReferencePath, resolveScriptPath } from './skill';

const SKILL_FILENAME = 'SKILL.md';

export interface SkillManagerOptions {
  skillPaths: string[];
  parser?: SkillParser;
  matcher?: SkillMatcher;
  executor?: ScriptExecutor;
}

export class SkillManager {
  skillPaths: string[];
  parser: SkillParser;
  matcher: SkillMatcher;
  executor: ScriptExecutor;
  private skills: Map<string, Skill> = new Map();
  private metadataIndex: SkillMetadata[] = [];
  private discovered = false;

  constructor(options: SkillManagerOptions) {
    this.skillPaths = options.skillPaths.map((p) => path.resolve(p.replace(/^~/, process.env.HOME ?? '')));
    this.parser = options.parser ?? new SkillParser();
    this.matcher = options.matcher ?? new SkillMatcher();
    this.executor = options.executor ?? new ScriptExecutor();
  }

  getSkills(): Map<string, Skill> {
    return new Map(this.skills);
  }

  getMetadataIndex(): SkillMetadata[] {
    return [...this.metadataIndex];
  }

  async discover(force = false): Promise<SkillMetadata[]> {
    if (this.discovered && !force) {
      return this.metadataIndex;
    }

    this.skills.clear();
    this.metadataIndex = [];

    for (const skillPath of this.skillPaths) {
      try {
        const stat = await fs.stat(skillPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      for (const skill of await this.scanDirectory(skillPath)) {
        this.registerSkill(skill);
      }
    }

    this.discovered = true;
    return this.metadataIndex;
  }

  private async scanDirectory(directory: string): Promise<Skill[]> {
    const result: Skill[] = [];
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const skillFile = path.join(directory, ent.name, SKILL_FILENAME);
        try {
          await fs.access(skillFile);
          const skill = await this.parser.parseFile(skillFile, true);
          result.push(skill);
        } catch {
          // skip
        }
      }
    }

    const directSkill = path.join(directory, SKILL_FILENAME);
    try {
      await fs.access(directSkill);
      const skill = await this.parser.parseFile(directSkill, true);
      result.push(skill);
    } catch {
      // skip
    }

    return result;
  }

  private registerSkill(skill: Skill): void {
    this.skills.set(skill.metadata.name, skill);
    this.metadataIndex.push(skill.metadata);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  async loadInstruction(skillName: string): Promise<SkillInstruction | undefined> {
    const skill = this.skills.get(skillName);
    if (!skill) return undefined;

    if (skill.instruction) return skill.instruction;

    if (skill.sourcePath) {
      const full = await this.parser.parseFile(skill.sourcePath, false);
      skill.instruction = full.instruction;
      return skill.instruction;
    }
    return undefined;
  }

  async loadReference(skillName: string, refPath: string): Promise<string | null> {
    const skill = this.skills.get(skillName);
    if (!skill) return null;

    const ref = skill.resources.references.find((r) => r.path === refPath);
    if (!ref) return null;

    if (ref.content != null) return ref.content;

    const resolved = resolveReferencePath(skill, ref);
    if (resolved) {
      try {
        const content = await fs.readFile(resolved, 'utf-8');
        ref.content = content;
        return content;
      } catch {
        // ignore
      }
    }
    return null;
  }

  match(query: string, limit = 5): Skill[] {
    const matchedMetadata = this.matcher.match(query, this.metadataIndex, limit);
    return matchedMetadata
      .map((m) => this.skills.get(m.name))
      .filter((s): s is Skill => s != null);
  }

  getAllMetadata(): Array<{ name: string; description: string; triggers: string[] }> {
    return this.metadataIndex.map((m) => ({
      name: m.name,
      description: m.description,
      triggers: m.triggers,
    }));
  }

  async executeScript(
    skillName: string,
    scriptName: string,
    options: { inputData?: string; [key: string]: unknown } = {}
  ): Promise<string> {
    const skill = this.skills.get(skillName);
    if (!skill) throw new Error(`Skill not found: ${skillName}`);

    const script = skill.resources.scripts.find((s) => s.name === scriptName);
    if (!script) throw new Error(`Script not found: ${scriptName}`);

    const resolved = resolveScriptPath(skill, script);
    if (!resolved) throw new Error(`Script file not found: ${script.path}`);

    try {
      await fs.access(resolved);
    } catch {
      throw new Error(`Script file not found: ${resolved}`);
    }

    return this.executor.execute(resolved, {
      timeout: script.timeout,
      sandbox: script.sandbox,
      inputData: options.inputData,
      ...options,
    });
  }
}
