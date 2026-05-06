import { z } from 'zod';

export const completionBodySchema = z.object({
  prompt: z.string().min(1, 'prompt is required').max(8000),
});
export type CompletionBody = z.infer<typeof completionBodySchema>;
