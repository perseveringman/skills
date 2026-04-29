import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "./constants";

// matchMedia-backed responsive hook. Re-evaluates on orientation change.
export function useIsMobile(): boolean {
  const query = `(max-width: ${MOBILE_BREAKPOINT}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return isMobile;
}
