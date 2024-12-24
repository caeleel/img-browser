export function blur(e: KeyboardEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (e.target as HTMLElement)?.blur ? (e.target as HTMLElement).blur() : null;
}