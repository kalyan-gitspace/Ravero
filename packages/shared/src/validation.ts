export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidIndianPhoneNumber(value: string): boolean {
  return /^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(value.trim());
}
