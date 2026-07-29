'use client';

import * as React from 'react';
import { Command } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';

export function CommandPaletteHintBanner() {
  // Defaults to the Windows/Linux label until mounted (avoids an SSR/client
  // hydration mismatch), then flips to ⌘ on Mac — same convention as the
  // command palette trigger itself.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent));
  }, []);

  const modifier = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-primary/5 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Command className="size-4" />
      </span>
      <p className="flex-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Tip:</span> Press <Kbd>{modifier}</Kbd> <Kbd>K</Kbd> from
        anywhere to jump to a page or run an action.
      </p>
    </div>
  );
}
