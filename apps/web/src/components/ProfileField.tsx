import type { LucideIcon } from 'lucide-react';

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</p>;
}

export function ProfileField({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      <div className="flex flex-col">
        <Eyebrow>{label}</Eyebrow>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
