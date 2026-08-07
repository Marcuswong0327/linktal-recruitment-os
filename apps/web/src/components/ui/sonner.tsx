'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        // Kept in sync with the `toast-countdown` animation's duration in globals.css.
        duration: 4000,
        classNames: {
          toast: 'cn-toast',
          // Sonner's own default is an unstyled black pill — this matches
          // the Button component's "outline" variant + "xs" size instead, so
          // action buttons (Undo, etc.) read as part of this app rather than
          // an out-of-the-box widget.
          actionButton:
            '!gap-1 !rounded-lg !border !border-border !bg-background !text-foreground hover:!bg-muted !h-6 !px-2.5 !text-xs !font-medium [&_svg]:size-3 [&_svg]:shrink-0',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
