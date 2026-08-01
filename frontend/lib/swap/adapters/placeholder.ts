// lib/swap/adapters/placeholder.ts
// A route that is real but not yet wired renders as a disabled row with an honest
// reason — never a fabricated quote (spec §0.2, §6). Used for UnitFlow / Synthra /
// Circle until each is verified and given a real adapter.

import type { RouteAdapter, RouteId, RouteStatus } from "../types";

export function placeholderAdapter(
  id: RouteId,
  displayName: string,
  status: Exclude<RouteStatus, "ready">,
  statusReason: string,
): RouteAdapter {
  return {
    id,
    displayName,
    status,
    statusReason,
    supports: () => true,
    quote: async () => null,
  };
}
