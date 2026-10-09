import { useEffect, useState } from "react";

/** Re-read `read()` every `intervalMs` and re-render with the result. */
export function usePolled<T>(read: () => T, intervalMs: number): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setValue(read()), intervalMs);
    return () => clearInterval(timer);
  }, [read, intervalMs]);
  return value;
}

export function formatSeconds(ms: number, digits = 1): string {
  return `${(ms / 1000).toFixed(digits)} s`;
}
