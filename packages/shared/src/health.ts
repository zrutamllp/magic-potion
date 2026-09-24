import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['ok', 'down', 'not_configured']),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
