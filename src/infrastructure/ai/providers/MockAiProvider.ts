import type { IAiProvider, AiEvent, AiMessage, ToolDef } from './IAiProvider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SCRIPT = [
  'I am a mock AI. ',
  'I will respond ',
  'with a few short tokens ',
  'so you can see the SSE stream working. ',
  'Done.',
];

export class MockAiProvider implements IAiProvider {
  private readonly tokenDelayMs: number;

  constructor(opts: { tokenDelayMs?: number } = {}) {
    this.tokenDelayMs = opts.tokenDelayMs ?? 50;
  }

  async *stream(opts: { messages: AiMessage[]; tools?: ToolDef[] }): AsyncIterable<AiEvent> {
    yield { type: 'thinking' };
    await sleep(this.tokenDelayMs);

    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    const wantsWeather =
      !!opts.tools &&
      !!lastUser &&
      /weather/i.test(lastUser.content) &&
      opts.tools.some((t) => t.name === 'getCurrentWeather');

    if (wantsWeather) {
      const tool = opts.tools!.find((t) => t.name === 'getCurrentWeather')!;
      const args = { city: this.extractCity(lastUser!.content) };
      yield { type: 'tool_call', name: tool.name, args };
      const result = await tool.execute(args);
      yield { type: 'tool_result', name: tool.name, result };
      const summary = `The current weather in ${(args as { city: string }).city} is mocked: ${JSON.stringify(result)}.`;
      for (const chunk of summary.match(/.{1,12}/g) ?? []) {
        yield { type: 'token', text: chunk };
        await sleep(this.tokenDelayMs);
      }
      yield { type: 'done', finishReason: 'tool_calls' };
      return;
    }

    for (const t of SCRIPT) {
      yield { type: 'token', text: t };
      await sleep(this.tokenDelayMs);
    }
    yield { type: 'done', finishReason: 'stop' };
  }

  private extractCity(prompt: string): string {
    const m = prompt.match(/in\s+([A-Z][a-zA-Z]+)/);
    return m?.[1] ?? 'Istanbul';
  }
}
