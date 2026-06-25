import { z } from "npm:@hono/zod-openapi";

export const BlocklistImportResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  summary: z.array(z.any()).optional(),
  error: z.string().optional(),
});
