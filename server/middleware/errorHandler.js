import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    err = new AppError(400, 'UPLOAD_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message);
  } else if (err?.type === 'entity.parse.failed') {
    err = new AppError(400, 'BAD_REQUEST', 'Malformed JSON body');
  } else if (err?.type === 'entity.too.large') {
    err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (err?.code === '23505') {
    // Unique violation that wasn't handled more specifically (see db/pool.js for the codes).
    err = new AppError(409, 'CONFLICT', 'A record with the same unique value already exists', { constraint: err.constraint });
  } else if (err?.code === '23503') {
    err = new AppError(409, 'CONFLICT', 'This record is linked to other data and cannot be changed this way');
  } else if (err?.errno === 1406) {
    // MySQL "Data too long for column"; validation normally catches this first.
    err = new AppError(400, 'BAD_REQUEST', 'One of the values is too long');
  }

  if (err instanceof AppError) {
    if (err.status >= 500) (req.log ?? logger).error({ err }, err.message);
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
