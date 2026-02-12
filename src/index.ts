/**
 * melody-skills-openai-core
 * Node.js 版 OpenSkills - Agent Skill 渐进式披露架构
 *
 * Quick Start:
 *   const { createAgent } = require('melody-skills-openai-core');
 *   const agent = await createAgent({
 *     skillPaths: ['./skills'],
 *     model: 'gpt-4',
 *   });
 *   const response = await agent.chat('帮我总结会议');
 *   console.log(response.content, response.skillUsed);
 */

export { SkillManager } from './core/manager';
export type { Skill } from './core/skill';
export { SkillParser, SkillMatcher, ScriptExecutor } from './core';
export {
  createSkillMetadata,
  matchesQuery,
  type SkillMetadata,
} from './models/metadata';
export type { SkillInstruction } from './models/instruction';
export {
  ReferenceMode,
  type Reference,
  type Script,
  type SkillResources,
  isReferenceLoaded,
  getInvocationHint,
} from './models/resource';
export {
  createSkillDependency,
  hasDependencies,
  type SkillDependency,
} from './models/dependency';
export {
  SkillAgent,
  createAgent,
  type AgentResponse,
  type ConversationContext,
  type SkillAgentOptions,
  type CreateAgentOptions,
} from './agent';
export {
  OpenAICompatClient,
  createClient,
} from './llm/openai-compat';
export type { OpenAICompatClientOptions } from './llm/openai-compat';
export { PromptBuilder } from './llm/prompt-builder';
export type {
  Message,
  ChatResponse,
  StreamChunk,
  ImageContent,
  BaseLLMClient,
} from './llm/base';
export { messageUser, messageAssistant, messageSystem } from './llm/base';
