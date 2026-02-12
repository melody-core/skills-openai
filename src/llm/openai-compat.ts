/**
 * OpenAI 兼容 LLM 客户端
 */

import OpenAI from 'openai';
import type { Message, ChatResponse, StreamChunk, ImageContent } from './base';

function resolveMessages(messages: Message[], system?: string | null): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];
  if (system) {
    out.push({ role: 'system', content: system });
  }
  for (const msg of messages) {
    if (msg.images?.length) {
      const content: OpenAI.ChatCompletionContentPart[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const img of msg.images) {
        const url = img.url ?? (img.base64Data ? `data:${img.mediaType ?? 'image/jpeg'};base64,${img.base64Data}` : undefined);
        if (url) {
          content.push({
            type: 'image_url',
            image_url: { url, detail: (img.detail as 'low' | 'high' | 'auto') ?? 'auto' },
          });
        }
      }
      out.push({
        role: msg.role as 'user',
        content,
      } as OpenAI.ChatCompletionMessageParam);
    } else {
      out.push({ role: msg.role, content: msg.content });
    }
  }
  return out;
}

export interface OpenAICompatClientOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export class OpenAICompatClient {
  client: OpenAI;
  model: string;

  constructor(options: OpenAICompatClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    const baseURL = options.baseURL ?? process.env.OPENAI_BASE_URL?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
    this.model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4';
    console.log('===options===', options);
    this.client = new OpenAI({
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      timeout: options.timeout ?? 120000,
      defaultHeaders: options.defaultHeaders,
    });
  }

  async chat(params: {
    messages: Message[];
    system?: string | null;
    temperature?: number;
    maxTokens?: number | null;
    model?: string;
    [key: string]: unknown;
  }): Promise<ChatResponse> {
    const { messages, system, temperature = 0.7, maxTokens, model } = params;
    const apiMessages = resolveMessages(messages, system);

    const completion = await this.client.chat.completions.create({
      model: model ?? this.model,
      messages: apiMessages,
      temperature,
      max_tokens: maxTokens ?? undefined,
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    const content = typeof msg?.content === 'string' ? msg.content : '';

    const toolCalls = msg?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: (tc.function as { name: string }).name,
      arguments: (tc.function as { arguments: string }).arguments,
    }));

    return {
      content,
      model: completion.model ?? undefined,
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : undefined,
      finishReason: choice?.finish_reason ?? undefined,
      toolCalls,
    };
  }

  async *chatStream(params: {
    messages: Message[];
    system?: string | null;
    temperature?: number;
    maxTokens?: number | null;
    model?: string;
    [key: string]: unknown;
  }): AsyncGenerator<StreamChunk> {
    const { messages, system, temperature = 0.7, maxTokens, model } = params;
    const apiMessages = resolveMessages(messages, system);

    const stream = await this.client.chat.completions.create({
      model: model ?? this.model,
      messages: apiMessages,
      temperature,
      max_tokens: maxTokens ?? undefined,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content ?? '';
      const finishReason = chunk.choices[0]?.finish_reason ?? undefined;
      yield { content, finishReason, toolCalls: undefined };
    }
  }
}

export function createClient(
  provider: 'openai' | 'azure' = 'openai',
  options: { defaultHeaders?: Record<string, string>; apiKey?: string; model?: string; baseURL?: string; deployment?: string; endpoint?: string; apiVersion?: string } = {}
): OpenAICompatClient {
  if (provider === 'azure') {
    const endpoint = options.endpoint ?? process.env.AZURE_OPENAI_ENDPOINT ?? '';
    const deployment = options.deployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4';
    const apiKey = options.apiKey ?? process.env.AZURE_OPENAI_API_KEY ?? '';
    const apiVersion = options.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';
    const baseURL = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}?api-version=${apiVersion}`;
    return new OpenAICompatClient({
      apiKey,
      baseURL,
      model: deployment,
      defaultHeaders: options.defaultHeaders,
    });
  }
  return new OpenAICompatClient({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    model: options.model,
  });
}
