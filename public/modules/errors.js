export class PocError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   * @param {number} [attempts]
   * @param {number} [retryDelayMs]
   */
  constructor(code, message, status = 400, attempts = 0, retryDelayMs = 0) {
    super(message);
    this.name = 'PocError';
    this.code = code;
    this.status = status;
    this.attempts = attempts;
    this.retryDelayMs = retryDelayMs;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
