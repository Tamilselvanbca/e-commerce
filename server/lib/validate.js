import { z } from 'zod';
import { AppError } from './errors.js';

/** Parses `data` with a zod schema, throwing a 400 VALIDATION_ERROR on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      result.error.issues[0]?.message ?? 'Invalid request',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const uuid = z.uuid({ message: 'Invalid id' });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginated(items, total, page, pageSize) {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

/** Optional trimmed string; empty strings become null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
