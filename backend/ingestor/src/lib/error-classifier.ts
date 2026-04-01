export type ErrorClass = 'auth' | 'rate_limit' | 'platform' | 'transient';

export type ClassifiedError = {
  errorClass: ErrorClass;
  userFacing: boolean;
  userMessage: string;
  rawMessage: string;
};

const AUTH_PATTERNS = [
  '401', '403', 'unauthorized', 'forbidden', 'invalid credentials',
  'token expired', 'authentication failed', 'invalid_grant', 'access denied',
];

const RATE_LIMIT_PATTERNS = [
  '429', 'rate limit', 'too many requests', 'throttled', 'quota exceeded',
];

const PLATFORM_PATTERNS = [
  '500', '502', '503', '504', 'internal server error',
  'service unavailable', 'bad gateway', 'upstream', 'gateway timeout',
];

function matchesAny(msg: string, patterns: string[]): boolean {
  return patterns.some((p) => msg.includes(p));
}

export function classifyError(err: unknown): ClassifiedError {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const msg = rawMessage.toLowerCase();

  if (matchesAny(msg, AUTH_PATTERNS)) {
    return {
      errorClass: 'auth',
      userFacing: true,
      userMessage: 'Authentication failed — please reconnect this integration.',
      rawMessage,
    };
  }

  if (matchesAny(msg, RATE_LIMIT_PATTERNS)) {
    return {
      errorClass: 'rate_limit',
      userFacing: false,
      userMessage: 'Rate limit hit — sync will retry automatically.',
      rawMessage,
    };
  }

  if (matchesAny(msg, PLATFORM_PATTERNS)) {
    return {
      errorClass: 'platform',
      userFacing: false,
      userMessage: "The integration's servers are temporarily unavailable.",
      rawMessage,
    };
  }

  return {
    errorClass: 'transient',
    userFacing: false,
    userMessage: 'An unexpected error occurred — sync will retry automatically.',
    rawMessage,
  };
}
