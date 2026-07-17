/** RFC 7807 problem — the one error shape the whole app handles. */

import type { ApiProblem } from './types';

export class ApiError extends Error {
  readonly problem: ApiProblem;

  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get status() {
    return this.problem.status;
  }

  /** field-level validation messages (422), keyed by field name */
  get fieldErrors() {
    return this.problem.errors ?? {};
  }
}

export function problem(status: number, title: string, detail?: string, errors?: Record<string, string>): ApiError {
  return new ApiError({ type: `https://replift.app/problems/${slug(title)}`, title, status, detail, errors });
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Network-level failure (offline, timeout) — distinct from server-rejected. */
export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

/** User-facing message for any thrown error, with safe fallback. */
export function errorMessage(e: unknown): string {
  if (isNetworkError(e)) return "You're offline — changes are saved locally and will sync when you reconnect.";
  if (isApiError(e)) return e.problem.detail ?? e.problem.title;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}
