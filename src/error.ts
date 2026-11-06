import fs from 'fs/promises';
import { color } from './color';

export interface ApiErrorOptions {
  status: number;
  payload?: string;
  endpoint?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload?: string;
  public readonly endpoint?: string;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.payload = options.payload;
    this.endpoint = options.endpoint;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isVerbose(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  return argv.includes('--verbose') || argv.includes('-v') || env.VERBOSE === 'true' || env.VERBOSE === '1';
}

export function extractApiError(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.cause instanceof ApiError) return error.cause;
  return null;
}

export function formatErrorMessage(error: unknown, verbose = isVerbose()): string {
  const apiError = extractApiError(error);
  if (apiError) {
    if (verbose && apiError.payload) {
      return `${apiError.message}\n${color.yellow('[Detail API]:')} ${apiError.payload}`;
    }
    return apiError.message;
  }

  if (error instanceof Error) {
    if (verbose && error.stack) {
      return `${error.message}\n${color.yellow('[Stack trace]:')} ${error.stack}`;
    }
    return error.message;
  }

  return String(error);
}

export async function logError(error: unknown, logFilePath = 'error.log'): Promise<void> {
  const apiError = extractApiError(error);
  let message: string;
  if (apiError && apiError.payload) {
    message = `${apiError.stack || apiError.message}\nPayload API (${apiError.endpoint || 'unknown'} - HTTP ${apiError.status}): ${apiError.payload}`;
  } else if (error instanceof Error) {
    message = error.stack || error.message;
  } else {
    message = String(error);
  }
  const logLine = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(logFilePath, logLine, 'utf8').catch(() => {});
}
