export function normalizeRequestId(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === 'string' && value.length > 0 && value.length <= 256) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string' && first.length > 0 && first.length <= 256) {
      return first;
    }
  }
  return undefined;
}
