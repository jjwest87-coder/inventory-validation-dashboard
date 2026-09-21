// Pure, dependency-free helper — safe to import from client components too
// (unlike src/lib/inventory.ts, which pulls in the server-only db module).

/** Returns a warning message if orderedQty isn't a multiple of the item's required unit, else null. */
export function checkOrderMultiple(multiple: number | null, orderedQty: number): string | null {
  if (multiple == null) return null;
  if (!Number.isFinite(orderedQty)) return null;
  if (orderedQty % multiple !== 0) return `발주 수량은 ${multiple}의 배수로 입력해야 합니다.`;
  return null;
}
