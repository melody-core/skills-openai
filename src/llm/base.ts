/**
 * LLM 客户端基础类型
 */

export type ImageDetail = 'low' | 'high' | 'auto';

export interface ImageContent {
  type: 'image_url';
  url?: string;
  base64Data?: string;
  filePath?: string;
  mediaType?: string;
  detail?: ImageDetail;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ImageContent[];
  name?: string;
}

export interface ChatResponse {
  content: string;
  model?: string;
  usage?: Record<string, number>;
  finishReason?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface StreamChunk {
  content: string;
  finishReason?: string | null;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface BaseLLMClient {
  chat(
    params: {
      messages: Message[];
      system?: string | null;
      temperature?: number;
      maxTokens?: number | null;
      [key: string]: unknown;
    }
  ): Promise<ChatResponse>;

  chatStream?(
    params: {
      messages: Message[];
      system?: string | null;
      temperature?: number;
      maxTokens?: number | null;
      [key: string]: unknown;
    }
  ): AsyncGenerator<StreamChunk>;
}

export function messageUser(content: string, images?: ImageContent[]): Message {
  return { role: 'user', content, images: images ?? [] };
}

export function messageAssistant(content: string): Message {
  return { role: 'assistant', content };
}

export function messageSystem(content: string): Message {
  return { role: 'system', content };
}
