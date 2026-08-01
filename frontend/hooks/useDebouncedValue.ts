// hooks/useDebouncedValue.ts
// Decouples "what the user is typing" from "what triggers an RPC round trip".
// The input field itself always reflects every keystroke instantly; only the
// value fed into quoting/balance-adjacent effects waits for a pause in typing.

"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
