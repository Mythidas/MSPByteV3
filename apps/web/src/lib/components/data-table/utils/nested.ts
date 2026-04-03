/**
 * Get nested value from object using dot notation
 * @example getNestedValue({ user: { name: 'John' } }, 'user.name') => 'John'
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!path || obj === null || obj === undefined) return undefined;
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set nested value in object using dot notation
 * @example setNestedValue({}, 'user.name', 'John') => { user: { name: 'John' } }
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  const last = parts.pop();
  if (!last) return;
  let current: Record<string, unknown> = obj;
  for (const part of parts) {
    const next = current[part];
    if (next === null || typeof next !== 'object') {
      current[part] = {};
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    current = current[part] as Record<string, unknown>;
  }
  current[last] = value;
}
