export class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code   machine readable error code, e.g. OUT_OF_STOCK
   * @param {string} message human readable message (safe to show to users)
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please log in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
