'use client';

import * as React from 'react';
import { FolderTree } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';

export interface NewSpecializationRequest {
  /** The name typed into the Specialization cell that didn't match anything. */
  name: string;
  /** The row's current industry — what the picker below opens on. */
  industryId: string;
}

interface NewSpecializationDialogProps {
  /**
   * Held separately from `open` so the name and industry survive the ~150ms
   * close animation instead of blanking mid-fade — same reasoning as
   * `ConfirmSubmitCandidateDialog`'s `candidate`.
   */
  request: NewSpecializationRequest | null;
  /** The full industry catalog — 4 rows, so no search needed. */
  industries: { value: string; label: string }[];
  isSaving: boolean;
  onCancel: () => void;
  /**
   * `industryId` is whatever the user settled on — the row's own industry
   * unless they changed it. The caller retags the company when it differs,
   * so the company's industry and its specialization's parent stay in step.
   */
  onConfirm: (industryId: string) => void;
}

/**
 * The second step of creating a specialization from the Companies grid.
 *
 * `Specialization` is a child rung of `Industry`, so a new one can't be
 * created from a name alone — `POST /specializations` requires `industryId`.
 * Rather than ask cold, this opens on the company's existing industry: in the
 * common case the answer is already correct and Create is a single keystroke.
 *
 * Changing it is allowed but not free — see `onConfirm`.
 */
export function NewSpecializationDialog({
  request,
  industries,
  isSaving,
  onCancel,
  onConfirm,
}: NewSpecializationDialogProps) {
  const [industryId, setIndustryId] = React.useState('');

  // Re-seed from the row every time the dialog opens, so a previous answer
  // never leaks into the next specialization created in the same session.
  React.useEffect(() => {
    if (request) setIndustryId(request.industryId);
  }, [request]);

  const changed = request !== null && industryId !== request.industryId;

  return (
    <AlertDialog open={request !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FolderTree className="size-4 text-muted-foreground" />
            New specialization
          </AlertDialogTitle>
          <AlertDialogDescription>
            {request ? (
              <>
                <span className="font-medium text-foreground">{request.name}</span> doesn&apos;t
                exist yet. Specializations sit under an industry — confirm which one it belongs to.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FormField label="Industry" htmlFor="new-specialization-industry" required>
          {/*
            Pick-only, deliberately. Industry is admin/manager-only to create
            (docs/rbac-roles.md), while this dialog is reachable by any
            consultant who can grow the specialization catalog — so the parent
            rung is never grown from here.
          */}
          <EnumSelect
            id="new-specialization-industry"
            value={industryId}
            onValueChange={setIndustryId}
            options={industries}
            disabled={isSaving}
          />
        </FormField>

        {changed ? (
          <p className="text-sm text-muted-foreground">
            This company will be moved to that industry too — a company can&apos;t sit in one
            industry while its specialization belongs to another.
          </p>
        ) : null}

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(industryId)}
            disabled={isSaving || !industryId}
          >
            {isSaving ? 'Creating…' : 'Create'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
