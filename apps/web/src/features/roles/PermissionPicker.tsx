'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useGetPermissions } from '@/lib/api/generated/permissions/permissions';
import { ACTION_ORDER } from './schema';

/**
 * Grid of the permission catalog: resources down the side, actions across the
 * top, a checkbox at each intersection that exists. Clicking a resource name
 * toggles that whole row. Value is the set of selected permission ids.
 */
export function PermissionPicker({
  value,
  onChange,
  disabled,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useGetPermissions();
  const permissions = data?.status === 200 ? data.data : [];

  // resource → { action: permissionId }
  const byResource = React.useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const p of permissions) {
      if (!map.has(p.resource)) map.set(p.resource, {});
      map.get(p.resource)![p.action] = p.id;
    }
    return map;
  }, [permissions]);

  const actions = React.useMemo(() => {
    const present = new Set(permissions.map((p) => p.action));
    return ACTION_ORDER.filter((a) => present.has(a));
  }, [permissions]);

  const gridStyle = { gridTemplateColumns: `1fr repeat(${actions.length}, 3.5rem)` } as const;

  function setId(id: string, checked: boolean) {
    const next = new Set(value);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  }

  function toggleRow(ids: string[], checked: boolean) {
    const next = new Set(value);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }

  if (isLoading) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading permissions…</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div
        className="grid items-center border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase text-muted-foreground"
        style={gridStyle}
      >
        <span>Resource</span>
        {actions.map((a) => (
          <span key={a} className="text-center">
            {a.charAt(0)}
          </span>
        ))}
      </div>
      <div className="divide-y">
        {[...byResource.entries()].map(([resource, actionMap]) => {
          const ids = Object.values(actionMap);
          const allChecked = ids.length > 0 && ids.every((id) => value.has(id));
          return (
            <div key={resource} className="grid items-center px-3 py-1.5 text-sm" style={gridStyle}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleRow(ids, !allChecked)}
                className="text-left font-medium capitalize disabled:cursor-not-allowed disabled:opacity-60"
                title="Toggle all"
              >
                {resource.replace(/_/g, ' ')}
              </button>
              {actions.map((a) => {
                const id = actionMap[a];
                return (
                  <div key={a} className="flex justify-center">
                    {id ? (
                      <Checkbox
                        checked={value.has(id)}
                        disabled={disabled}
                        onCheckedChange={(checked) => setId(id, Boolean(checked))}
                      />
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
