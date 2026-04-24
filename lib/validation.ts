import { z } from "zod";

export const EventSchema = z.object({
  event_id: z.string().uuid(),
  machine_id: z.string().min(1).max(64),
  event_type: z.string().min(1).max(64),
  timestamp: z.string().datetime({ offset: true }),
  payload: z.record(z.unknown()).optional().default({}),
});

export type EventInput = z.infer<typeof EventSchema>;

export const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(500),
});

// Face training
export const TrainFaceSchema = z.object({
  name: z.string().min(1).max(64),
  label: z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[a-z0-9_-]+$/,
      "label must be lowercase alphanumeric, hyphens, underscores"
    ),
  employee_id: z.string().min(1).max(32).optional(),
  notes: z.string().max(255).optional(),
});
