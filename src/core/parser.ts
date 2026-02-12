/**
 * SKILL.md 解析器 - 三层渐进式披露
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { parseFrontmatter } from '../utils/frontmatter';
import type { Skill } from './skill';
import type { SkillMetadata } from '../models/metadata';
import type { SkillInstruction } from '../models/instruction';
import type { Reference, Script, SkillResources } from '../models/resource';
import { ReferenceMode } from '../models/resource';
import { createSkillDependency } from '../models/dependency';
import { createSkillMetadata } from '../models/metadata';

const REQUIRED_FIELDS = ['name', 'description'];
const SUPPORTED_REF_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);

export class SkillParser {
  parseFile(filePath: string, metadataOnly = false): Promise<Skill> {
    return fs.readFile(filePath, 'utf-8').then((content) =>
      this.parseContent(content, filePath, metadataOnly)
    );
  }

  parseContent(
    content: string,
    sourcePath?: string,
    metadataOnly = false
  ): Skill {
    const [frontmatter, body] = parseFrontmatter(content);
    this.validateFrontmatter(frontmatter as Record<string, unknown>);

    const metadata = this.parseMetadata(frontmatter as Record<string, unknown>);
    const resources = this.parseResources(
      frontmatter as Record<string, unknown>,
      sourcePath
    );

    const skill: Skill = {
      metadata,
      resources,
      sourcePath: sourcePath ?? null,
      instruction: undefined,
    };

    if (!metadataOnly && body) {
      skill.instruction = {
        content: body,
        rawContent: content,
      };
    }

    return skill;
  }

  private validateFrontmatter(fm: Record<string, unknown>): void {
    const missing = REQUIRED_FIELDS.filter((f) => !(f in fm));
    if (missing.length) {
      throw new Error(`Missing required fields in frontmatter: ${missing.join(', ')}`);
    }
  }

  private parseMetadata(fm: Record<string, unknown>): SkillMetadata {
    return createSkillMetadata({
      name: String(fm.name),
      description: String(fm.description),
      version: fm.version != null ? String(fm.version) : '1.0.0',
      triggers: Array.isArray(fm.triggers) ? (fm.triggers as string[]) : [],
      author: fm.author != null ? String(fm.author) : undefined,
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    });
  }

  private parseResources(
    fm: Record<string, unknown>,
    sourcePath?: string
  ): SkillResources {
    const references: Reference[] = [];
    const declaredPaths = new Set<string>();

    const refs = fm.references as Array<Record<string, unknown> | string> | undefined;
    if (Array.isArray(refs)) {
      for (const refData of refs) {
        if (typeof refData === 'object' && refData !== null) {
          const modeStr = (refData.mode as string) ?? 'implicit';
          const mode =
            modeStr === 'always'
              ? ReferenceMode.ALWAYS
              : modeStr === 'explicit'
                ? ReferenceMode.EXPLICIT
                : ReferenceMode.IMPLICIT;
          const p = String(refData.path ?? '');
          declaredPaths.add(p);
          references.push({
            path: p,
            condition: refData.condition != null ? String(refData.condition) : undefined,
            description: refData.description != null ? String(refData.description) : undefined,
            mode,
          });
        } else if (typeof refData === 'string') {
          declaredPaths.add(refData);
          references.push({ path: refData, mode: ReferenceMode.IMPLICIT });
        }
      }
    }

    if (sourcePath) {
      const refsDir = path.join(path.dirname(sourcePath), 'references');
      this.discoverReferences(refsDir, declaredPaths, references);
    }

    const scripts: Script[] = [];
    const scriptsData = fm.scripts as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(scriptsData)) {
      for (const s of scriptsData) {
        if (s && typeof s === 'object') {
          scripts.push({
            name: String(s.name ?? ''),
            path: String(s.path ?? ''),
            description: String(s.description ?? ''),
            args: Array.isArray(s.args) ? (s.args as string[]) : [],
            timeout: typeof s.timeout === 'number' ? s.timeout : 30,
            sandbox: s.sandbox !== false,
            outputs: Array.isArray(s.outputs) ? (s.outputs as string[]) : [],
          });
        }
      }
    }

    const dependency = createSkillDependency(fm.dependency as Record<string, unknown>);
    return { references, scripts, dependency };
  }

  private discoverReferences(
    referencesDir: string,
    declaredPaths: Set<string>,
    out: Reference[]
  ): void {
    const fsSync = require('fs');
    const syncScan = (dir: string, basePath: string) => {
      let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[];
      try {
        entries = fsSync.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase();
          if (SUPPORTED_REF_EXT.has(ext)) {
            const rel = path.relative(basePath, full).replace(/\\/g, '/');
            const refPath = rel.startsWith('references/') ? rel : `references/${rel}`;
            if (!declaredPaths.has(refPath)) {
              out.push({
                path: refPath,
                description: `Auto-discovered: ${ent.name}`,
                mode: ReferenceMode.IMPLICIT,
              });
            }
          }
        } else if (ent.isDirectory()) {
          syncScan(full, basePath);
        }
      }
    };
    syncScan(referencesDir, referencesDir);
  }
}
