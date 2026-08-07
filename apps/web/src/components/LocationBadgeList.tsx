import { Badge } from '@/components/ui/badge';

/** Up to 2 locations shown inline as badges, "+N more" for the rest — for a table cell listing an entity's resolved location names (e.g. a Client's market, a Stakeholder's coverage). */
export function LocationBadgeList({ locations }: { locations: string[] }) {
  if (locations.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = locations.slice(0, 2);
  const rest = locations.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((name) => (
        <Badge key={name} variant="muted" className="rounded-md font-normal">
          {name}
        </Badge>
      ))}
      {rest > 0 ? <span className="text-xs text-muted-foreground">+{rest} more</span> : null}
    </div>
  );
}
