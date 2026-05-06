import { streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Tool, ToolExecutionOptions } from '@ai-sdk/provider-utils';
import type { IAiProvider, AiEvent, AiMessage, ToolDef } from './IAiProvider';
import type { Logger } from '@/infrastructure/logger/Logger';

/**
 * OpenAI provider implemented on top of the Vercel AI SDK (v6).
 *
 * Notes about the SDK surface this targets:
 *  - `streamText({ model, messages, tools, toolChoice, stopWhen })` returns a
 *    `StreamTextResult` whose `fullStream` is an `AsyncIterable<TextStreamPart>`.
 *  - In v6, the relevant part `type` literals are: `text-delta` (with field
 *    `text`), `tool-call` (with `toolName` and `input`), `tool-result` (with
 *    `toolName` and `output`), `tool-error`, `finish` (with `finishReason`),
 *    `error`. There are also lifecycle parts (`start`, `start-step`,
 *    `finish-step`, `text-start`, `text-end`, etc.) which we ignore.
 *  - The `tool()` helper takes `inputSchema` (Zod schemas are accepted as a
 *    `FlexibleSchema`) and an `execute(input, options)` function. The SDK
 *    invokes `execute` itself and emits the resulting `tool-result` part.
 *  - The default `stopWhen` is `stepCountIs(1)`, which stops after a single
 *    step. To allow the model to observe a tool result and produce a final
 *    natural-language reply, we set `stopWhen: stepCountIs(5)`.
 */
export class OpenAiProvider implements IAiProvider {
  private static readonly DEFAULT_MODEL = 'gpt-4o-mini';
  private static readonly MAX_STEPS = 5;

  private readonly client: ReturnType<typeof createOpenAI>;

  constructor(
    apiKey: string,
    private readonly logger: Logger,
    private readonly requestTimeoutMs: number = 30_000,
  ) {
    this.client = createOpenAI({ apiKey });
  }

  async *stream(opts: { messages: AiMessage[]; tools?: ToolDef[] }): AsyncIterable<AiEvent> {
    yield { type: 'thinking' };

    const sdkTools = this.buildSdkTools(opts.tools ?? []);
    const hasTools = Object.keys(sdkTools).length > 0;

    // AbortController fires after the configured timeout — the AI SDK aborts
    // the underlying fetch which surfaces as a thrown error here, counted as
    // a real failure by the retry decorator + circuit breaker chain above.
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error(`Request timed out after ${this.requestTimeoutMs}ms`));
    }, this.requestTimeoutMs);

    try {
      const result = streamText({
        model: this.client(OpenAiProvider.DEFAULT_MODEL),
        messages: opts.messages,
        ...(hasTools ? { tools: sdkTools, toolChoice: 'auto' as const } : {}),
        stopWhen: stepCountIs(OpenAiProvider.MAX_STEPS),
        abortSignal: abortController.signal,
        onError: ({ error }) => {
          this.logger.error({ err: error }, 'openai stream error');
        },
      });

      let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';

      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              if (part.text.length > 0) {
                yield { type: 'token', text: part.text };
              }
              break;
            case 'tool-call':
              yield { type: 'tool_call', name: part.toolName, args: part.input };
              break;
            case 'tool-result':
              yield { type: 'tool_result', name: part.toolName, result: part.output };
              break;
            case 'tool-error': {
              const message =
                part.error instanceof Error
                  ? part.error.message
                  : typeof part.error === 'string'
                    ? part.error
                    : JSON.stringify(part.error);
              this.logger.error(
                { err: part.error, toolName: part.toolName },
                'openai tool error',
              );
              yield { type: 'tool_error', name: part.toolName, message };
              break;
            }
            case 'finish':
              finishReason = OpenAiProvider.mapFinishReason(part.finishReason);
              break;
            case 'error': {
              // Vercel AI SDK emits `error` parts (rather than throwing) for
              // upstream API failures. Surface as a thrown error so the circuit
              // breaker registers a real failure and the global error handler
              // maps it to a 5xx (or our SSE error event).
              const errMsg =
                part.error instanceof Error
                  ? part.error.message
                  : typeof part.error === 'string'
                    ? part.error
                    : JSON.stringify(part.error);
              this.logger.error({ err: part.error }, 'openai stream error');
              throw new Error(`OpenAI provider error: ${errMsg}`);
            }
            default:
              // Lifecycle / informational parts (start, start-step, finish-step,
              // text-start, text-end, reasoning-*, tool-input-*, source, file,
              // abort, raw, tool-approval-request, tool-output-denied) are not
              // surfaced through our AiEvent contract.
              break;
          }
        }
      } catch (err) {
        this.logger.error({ err }, 'openai stream error');
        throw err;
      }

      yield { type: 'done', finishReason };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private buildSdkTools(tools: ToolDef[]): Record<string, Tool> {
    const sdkTools: Record<string, Tool> = {};
    for (const t of tools) {
      sdkTools[t.name] = tool({
        description: t.description,
        inputSchema: t.parameters,
        execute: async (input: unknown, _options: ToolExecutionOptions): Promise<unknown> => {
          return t.execute(input);
        },
      });
    }
    return sdkTools;
  }

  private static mapFinishReason(
    reason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other',
  ): 'stop' | 'length' | 'tool_calls' {
    if (reason === 'length') return 'length';
    if (reason === 'tool-calls') return 'tool_calls';
    return 'stop';
  }
}
