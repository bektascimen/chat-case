import type { z } from 'zod';

export type AiMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type ToolDef = {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown>;
};

export type AiEvent =
  | { type: 'thinking' }
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'tool_error'; name: string; message: string }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'tool_calls' };

export interface IAiProvider {
  stream(opts: { messages: AiMessage[]; tools?: ToolDef[] }): AsyncIterable<AiEvent>;
}
