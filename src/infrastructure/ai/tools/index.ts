import type { ToolDef } from '@/infrastructure/ai/providers/IAiProvider';
import { getCurrentWeather } from './getCurrentWeather';

const REGISTRY: ToolDef[] = [getCurrentWeather];

export const toolRegistry = {
  all(): ToolDef[] {
    return [...REGISTRY];
  },
  byName(name: string): ToolDef | undefined {
    return REGISTRY.find((t) => t.name === name);
  },
};
