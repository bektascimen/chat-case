import { z } from 'zod';
import type { ToolDef } from '@/infrastructure/ai/providers/IAiProvider';

const paramsSchema = z.object({
  city: z.string().min(1).describe('City name, e.g. "Istanbul"'),
});

export const getCurrentWeather: ToolDef = {
  name: 'getCurrentWeather',
  description: 'Returns mocked current weather for a given city.',
  parameters: paramsSchema,
  execute: async (raw) => {
    const { city } = paramsSchema.parse(raw);
    // Deterministic mock based on city char codes
    const tempC = 10 + (city.charCodeAt(0) % 25);
    const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
    const condition = conditions[city.length % conditions.length]!;
    return { city, tempC, condition };
  },
};
