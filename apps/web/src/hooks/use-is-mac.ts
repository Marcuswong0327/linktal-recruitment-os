import * as React from 'react';

/**
 * Defaults to false (Windows/Linux label) until mounted, to avoid an
 * SSR/client hydration mismatch, then flips to true on Mac.
 */
export function useIsMac() {
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent));
  }, []);

  return isMac;
}
