/** Tiny ID + timestamp helpers used by the backend modules. */

export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${uuid.slice(0, 8)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
