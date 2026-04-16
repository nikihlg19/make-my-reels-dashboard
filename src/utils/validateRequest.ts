import { z, ZodSchema } from 'zod';

/**
 * Validate req.body against a Zod schema.
 * Returns parsed data on success, or sends a 400 response and returns null.
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}

/**
 * Validate req.query against a Zod schema.
 * Returns parsed data on success, or sends a 400 response and returns null.
 */
export function validateQuery<T extends ZodSchema>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}
