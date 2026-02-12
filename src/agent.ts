/**
 * SkillAgent - 根据用户查询自动选择并调用 skill
 */

import * as path from 'path';
import type { Skill } from './core/skill';
import type { BaseLLMClient } from './llm/base';
import type { Message, ImageContent } from './llm/base';
import { messageUser, messageAssistant } from './llm/base';
import { SkillManager } from './core/manager';
import { PromptBuilder } from './llm/prompt-builder';
import { ReferenceMode } from './models/resource';
import { getSkillName } from './core/skill';

export type AgentState = 'idle' | 'skill_active' | 'awaiting_confirmation';

export interface ConversationContext {
  messages: Message[];
  activeSkill: Skill | null;
  state: AgentState;
  loadedReferences: string[];
  metadata: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  skillUsed: string | null;
  referencesLoaded: string[];
  scriptsExecuted: string[];
  usage: Record<string, unknown>;
}

export interface SkillAgentOptions {
  skillPaths: string[];
  llmClient: BaseLLMClient;
  baseSystemPrompt?: string;
  autoSelectSkill?: boolean;
  skillMatchThreshold?: number;
  autoLoadReferences?: boolean;
  autoExecuteScripts?: boolean;
  onSkillSelected?: (skill: Skill) => void;
  onReferenceLoaded?: (path: string, content: string) => void;
  onScriptExecuted?: (scriptName: string, result: string) => void;
}

export class SkillAgent {
  private skillPaths: string[];
  private llmClient: BaseLLMClient;
  private baseSystemPrompt: string;
  private autoSelectSkill: boolean;
  private skillMatchThreshold: number;
  private autoLoadReferences: boolean;
  private autoExecuteScripts: boolean;
  private onSkillSelected?: (skill: Skill) => void;
  private onReferenceLoaded?: (path: string, content: string) => void;
  private onScriptExecuted?: (scriptName: string, result: string) => void;

  private manager: SkillManager;
  private promptBuilder: PromptBuilder;
  private context: ConversationContext;
  private initialized = false;

  constructor(options: SkillAgentOptions) {
    this.skillPaths = options.skillPaths.map((p) => path.resolve(p.replace(/^~/, process.env.HOME ?? '')));
    this.llmClient = options.llmClient;
    this.baseSystemPrompt = options.baseSystemPrompt ?? '';
    this.autoSelectSkill = options.autoSelectSkill ?? true;
    this.skillMatchThreshold = options.skillMatchThreshold ?? 0.5;
    this.autoLoadReferences = options.autoLoadReferences ?? true;
    this.autoExecuteScripts = options.autoExecuteScripts ?? false;
    this.onSkillSelected = options.onSkillSelected;
    this.onReferenceLoaded = options.onReferenceLoaded;
    this.onScriptExecuted = options.onScriptExecuted;

    this.manager = new SkillManager({ skillPaths: this.skillPaths });
    this.promptBuilder = new PromptBuilder();
    this.context = {
      messages: [],
      activeSkill: null,
      state: 'idle',
      loadedReferences: [],
      metadata: {},
    };
  }

  async initialize(): Promise<number> {
    const list = await this.manager.discover();
    this.initialized = true;
    return list.length;
  }

  reset(): void {
    this.context = {
      messages: [],
      activeSkill: null,
      state: 'idle',
      loadedReferences: [],
      metadata: this.context.metadata,
    };
  }

  get activeSkill(): Skill | null {
    return this.context.activeSkill;
  }

  get availableSkills(): string[] {
    return this.manager.getAllMetadata().map((m) => m.name);
  }

  async selectSkill(skillName: string): Promise<boolean> {
    const skill = this.manager.getSkill(skillName);
    if (!skill) return false;

    await this.manager.loadInstruction(skillName);
    const updated = this.manager.getSkill(skillName);
    if (!updated) return false;

    this.context.activeSkill = updated;
    this.context.state = 'skill_active';
    this.onSkillSelected?.(updated);
    return true;
  }

  deselectSkill(): void {
    this.context.activeSkill = null;
    this.context.state = 'idle';
    this.context.loadedReferences = [];
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [];
    if (this.baseSystemPrompt) parts.push(this.baseSystemPrompt);
    if (this.context.activeSkill) {
      parts.push(
        this.promptBuilder.buildActiveSkillPrompt(this.context.activeSkill, true, true)
      );
    } else {
      const allMeta = this.manager.getAllMetadata();
      if (allMeta.length > 0) {
        const hints = allMeta.slice(0, 5).map((m) => `- ${m.name}: ${m.description}`);
        parts.push('Available capabilities:\n' + hints.join('\n'));
      }
    }
    return parts.join('\n\n');
  }

  private async loadApplicableReferences(userContent: string): Promise<string[]> {
    const skill = this.context.activeSkill;
    if (!skill) return [];

    const loaded: string[] = [];
    const alwaysRefs = skill.resources.references.filter(
      (r) => r.mode === ReferenceMode.ALWAYS && !this.context.loadedReferences.includes(r.path)
    );
    for (const ref of alwaysRefs) {
      const content = await this.manager.loadReference(skill.metadata.name, ref.path);
      if (content) {
        ref.content = content;
        this.context.loadedReferences.push(ref.path);
        loaded.push(ref.path);
        this.onReferenceLoaded?.(ref.path, content);
      }
    }

    const forEval = skill.resources.references.filter(
      (r) => r.mode !== ReferenceMode.ALWAYS && !this.context.loadedReferences.includes(r.path)
    );
    if (forEval.length > 0) {
      const evalResults = await this.evaluateReferenceConditions(userContent, forEval);
      for (let i = 0; i < forEval.length; i++) {
        if (evalResults[i]) {
          const ref = forEval[i];
          const content = await this.manager.loadReference(skill.metadata.name, ref.path);
          if (content) {
            ref.content = content;
            this.context.loadedReferences.push(ref.path);
            loaded.push(ref.path);
            this.onReferenceLoaded?.(ref.path, content);
          }
        }
      }
    }
    return loaded;
  }

  private async evaluateReferenceConditions(
    context: string,
    references: Array<{ path: string; condition?: string }>
  ): Promise<boolean[]> {
    if (references.length === 0) return [];

    const refsList = references
      .map(
        (r, i) =>
          `${i + 1}. Path: ${r.path}\n   Condition: ${r.condition ?? '(none, general reference)'}`
      )
      .join('\n');

    const evalPrompt = `For each reference, decide whether it is useful for answering the user's input.

User input:
\`\`\`
${context.slice(0, 500)}
\`\`\`

References:
${refsList}

For each reference, respond with YES or NO only.
Respond with one line per reference in format: "1. YES" or "1. NO"`;

    try {
      const response = await this.llmClient.chat({
        messages: [messageUser(evalPrompt)],
        system: 'You are a precise assistant. Only respond with YES or NO for each reference.',
        temperature: 0,
        maxTokens: 100,
      });

      const results: boolean[] = [];
      const lines = response.content.trim().split('\n');
      for (let i = 0; i < references.length; i++) {
        let found = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith(`${i + 1}.`) || trimmed.startsWith(`${i + 1}:`)) {
            results.push(trimmed.toLowerCase().includes('yes'));
            found = true;
            break;
          }
        }
        if (!found) results.push(false);
      }
      return results;
    } catch {
      return references.map(() => false);
    }
  }

  private async llmSelectSkill(query: string): Promise<string | null> {
    const allMeta = this.manager.getAllMetadata();
    if (allMeta.length === 0) return null;

    const skillsDesc = allMeta.map((m, i) => `${i + 1}. ${m.name}: ${m.description}`).join('\n');
    const evalPrompt = `Based on the user's input, select the most appropriate skill from the list below.
If none of the skills are relevant, respond with "NONE".

User input:
\`\`\`
${query.slice(0, 500)}
\`\`\`

Available skills:
${skillsDesc}

Respond with ONLY the skill name (e.g., "meeting-summary") or "NONE". No explanation needed.`;

    try {
      const response = await this.llmClient.chat({
        messages: [messageUser(evalPrompt)],
        system:
          'You are a skill router. Select the most appropriate skill based on the user\'s intent. Respond with only the skill name or NONE.',
        temperature: 0,
        maxTokens: 50,
      });

      const result = response.content.trim().replace(/^["']|["']$/g, '');
      for (const m of allMeta) {
        if (m.name.toLowerCase() === result.toLowerCase()) return m.name;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async handleScriptInvocations(responseContent: string): Promise<string[]> {
    const skill = this.context.activeSkill;
    if (!skill) return [];

    const invocations = this.promptBuilder.extractScriptInvocations(responseContent);
    const executed: string[] = [];
    for (const [scriptName, args] of invocations) {
      try {
        const inputData = args || responseContent.replace(/\[INVOKE:\w+(?:\([^)]*\))?\]/g, '').trim();
        const result = await this.manager.executeScript(skill.metadata.name, scriptName, {
          inputData,
        });
        executed.push(scriptName);
        this.onScriptExecuted?.(scriptName, result);
      } catch {
        // skip
      }
    }
    return executed;
  }

  async chat(
    content: string,
    options: {
      images?: ImageContent[];
      temperature?: number;
      maxTokens?: number;
      [key: string]: unknown;
    } = {}
  ): Promise<AgentResponse> {
    if (!this.initialized) await this.initialize();

    const userMsg = messageUser(content, options.images);
    this.context.messages.push(userMsg);

    let skillUsed: string | null = null;
    if (this.autoSelectSkill && !this.context.activeSkill) {
      const matched = this.manager.match(content, 1);
      if (matched.length > 0) {
        await this.selectSkill(matched[0].metadata.name);
        skillUsed = matched[0].metadata.name;
      } else {
        const llmSelected = await this.llmSelectSkill(content);
        if (llmSelected) {
          await this.selectSkill(llmSelected);
          skillUsed = llmSelected;
        }
      }
    }

    let referencesLoaded: string[] = [];
    if (this.autoLoadReferences && this.context.activeSkill) {
      referencesLoaded = await this.loadApplicableReferences(content);
    }

    const systemPrompt = this.buildSystemPrompt();

    const response = await this.llmClient.chat({
      messages: this.context.messages,
      system: systemPrompt,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? undefined,
      ...options,
    });

    this.context.messages.push(messageAssistant(response.content));

    let scriptsExecuted: string[] = [];
    if (this.autoExecuteScripts && this.context.activeSkill) {
      scriptsExecuted = await this.handleScriptInvocations(response.content);
    }

    return {
      content: response.content,
      skillUsed: skillUsed ?? (this.context.activeSkill ? getSkillName(this.context.activeSkill) : null),
      referencesLoaded,
      scriptsExecuted,
      usage: response.usage ?? {},
    };
  }
}

export interface CreateAgentOptions {
  skillPaths: string[];
  apiKey?: string;
  baseURL?: string;
  model?: string;
  autoSelectSkill?: boolean;
  autoLoadReferences?: boolean;
  autoExecuteScripts?: boolean;
  [key: string]: unknown;
}

export async function createAgent(options: CreateAgentOptions): Promise<SkillAgent> {
  const { OpenAICompatClient } = await import('./llm/openai-compat');
  const client = new OpenAICompatClient({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    model: options.model,
    defaultHeaders: options.defaultHeaders as Record<string, string> | undefined,
  });
  const {
    skillPaths,
    apiKey: _ak,
    baseURL: _bu,
    model: _m,
    autoSelectSkill,
    autoLoadReferences,
    autoExecuteScripts,
    ...rest
  } = options;
  const agent = new SkillAgent({
    skillPaths,
    llmClient: client,
    autoSelectSkill,
    autoLoadReferences,
    autoExecuteScripts,
    ...rest,
  });
  await agent.initialize();
  return agent;
}
