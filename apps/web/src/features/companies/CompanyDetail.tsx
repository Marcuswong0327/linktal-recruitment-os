'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  Contact,
  CornerDownLeft,
  Copy,
  EllipsisVertical,
  FileText,
  Globe,
  Mail,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Collapsible } from '@base-ui/react/collapsible';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AddTobRow, type AddTobValues } from '@/components/AddTobRow';
import { LinkedinIcon, SeekIcon } from '@/components/BrandIcons';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ConsultantAvatar, useConsultantLookup } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { LogContactRow, type LogContactValues } from '@/components/LogContactRow';
import { SpecializationCombobox } from '@/components/SpecializationPicker';
import { UrlField } from '@/components/UrlField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { cn } from '@/lib/utils';
import {
  getGetClientContactHistoryQueryKey,
  getGetClientQueryKey,
  getGetClientsQueryKey,
  useDeleteClient,
  useGetClient,
  useGetClientContactHistory,
  useRestoreClient,
  useUpdateClient,
} from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
  useGetIndustries,
} from '@/lib/api/generated/industries/industries';
import { useGetJobOrders } from '@/lib/api/generated/job-orders/job-orders';
import { useGetJobResearch } from '@/lib/api/generated/job-research/job-research';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
} from '@/lib/api/generated/specializations/specializations';
import {
  getGetStakeholdersQueryKey,
  useAddStakeholderContactHistory,
  useGetStakeholders,
} from '@/lib/api/generated/stakeholders/stakeholders';
import { getGetTobsQueryKey, useCreateTob, useGetTobs } from '@/lib/api/generated/tobs/tobs';
import type {
  ClientEntity,
  CreateStakeholderContactHistoryDto,
  CreateTobDto,
  UpdateClientDto,
} from '@/lib/api/generated/types';
import { formatDate as formatJobResearchDate } from '@/features/job-research/schema';
import { qualityOptions, statusOptions } from './schema';

const contactDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** One icon per external link (Website/LinkedIn/Seek) — click opens it in a new tab. A method with no value on file renders greyed-out and inert rather than being hidden, so the icon row's position doesn't shift. */
function LinkIconButton({
  icon: Icon,
  url,
  label,
  activeClassName = 'text-muted-foreground hover:text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  url?: string | null;
  label: string;
  /** Icon color when a value is on file — overridable for brand colors (e.g. LinkedIn blue). Disabled state ignores this and always renders greyed-out. */
  activeClassName?: string;
}) {
  const disabled = !url;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            onClick={disabled ? (e) => e.preventDefault() : undefined}
            aria-label={
              disabled ? `No ${label.toLowerCase()} on file` : `Open ${label.toLowerCase()}`
            }
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              disabled
                ? 'cursor-not-allowed text-muted-foreground'
                : cn(activeClassName, 'hover:bg-accent'),
            )}
          >
            <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
          </a>
        }
      />
      <TooltipContent>{disabled ? `No ${label.toLowerCase()} on file` : label}</TooltipContent>
    </Tooltip>
  );
}

function copyValue(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
  );
}

/**
 * A menu row for a contact method that can both be opened directly and
 * copied. Rendered as two adjacent `DropdownMenuItem`s rather than one row
 * with a nested button — Base UI tracks "highlighted" per composite-list
 * item (the whole row), not by pointer position within it, so a nested
 * button can't have its own independent hover state inside a single Item.
 * Two Items means two independently-highlightable targets instead. Falls
 * back to a single disabled item when there's no value to act on.
 */
function SplitActionRow({
  icon: Icon,
  value,
  label,
  emptyLabel,
  copyLabel,
  href,
  external,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
  emptyLabel: string;
  copyLabel: string;
  href: (value: string) => string;
  external?: boolean;
}) {
  if (!value) {
    return (
      <DropdownMenuItem disabled>
        <Icon />
        {emptyLabel}
      </DropdownMenuItem>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenuItem
        className="flex-1"
        render={
          <a
            href={href(value)}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
          />
        }
      >
        <Icon />
        {label}
      </DropdownMenuItem>
      <div className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <DropdownMenuItem
        className="w-8 shrink-0 justify-center px-0"
        onClick={() => copyValue(value, copyLabel)}
        aria-label={`Copy ${copyLabel.toLowerCase()}`}
      >
        <Copy className="size-3.5" />
      </DropdownMenuItem>
    </div>
  );
}

/** Each row (besides phone) splits into a direct-interact action (mailto:/open in a new tab) and a separate copy action — see `SplitActionRow`. Website is the company's, not the stakeholder's — Stakeholder carries no site of its own. Phone has no direct-interact counterpart (no tel: link), so its row stays copy-only. */
function StakeholderActionsMenu({
  email,
  mobile,
  linkedinUrl,
  website,
}: {
  email?: string | null;
  mobile?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Contact actions"
          >
            <EllipsisVertical className="size-4" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <SplitActionRow
          icon={Mail}
          value={email}
          label="Email"
          emptyLabel="No email on file"
          copyLabel="Email"
          href={(v) => `mailto:${v}`}
        />
        <DropdownMenuItem disabled={!mobile} onClick={() => mobile && copyValue(mobile, 'Mobile')}>
          <Phone />
          {mobile ? 'Copy mobile' : 'No mobile on file'}
        </DropdownMenuItem>
        <SplitActionRow
          icon={LinkedinIcon}
          value={linkedinUrl}
          label="LinkedIn"
          emptyLabel="No LinkedIn on file"
          copyLabel="LinkedIn"
          href={(v) => v}
          external
        />
        <SplitActionRow
          icon={Globe}
          value={website}
          label="Company's website"
          emptyLabel="No website on file"
          copyLabel="Website"
          href={(v) => v}
          external
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompanyDetail({
  id,
  canEdit = true,
  canDelete = true,
}: {
  id: string;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { data, isLoading, isError, error } = useGetClient(id);
  const company = data?.status === 200 ? data.data : undefined;

  if (isLoading) {
    return (
      <PageLayout>
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageLayout>
    );
  }

  if (isError || !company) {
    return (
      <PageLayout>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold">Company not found</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : `No company with ID ${id}.`}
          </p>
        </div>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/companies" />}>
            <ArrowLeft />
            Back to companies
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount when a different company loads so local form state resets.
  return (
    <CompanyEditForm key={company.id} company={company} canEdit={canEdit} canDelete={canDelete} />
  );
}

function CompanyEditForm({
  company,
  canEdit,
  canDelete,
}: {
  company: ClientEntity;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industryId, setIndustryId] = React.useState(company.industryId);
  const [specializationId, setSpecializationId] = React.useState(company.specializationId ?? '');
  const [locations, setLocations] = React.useState<LocationOption[]>(() =>
    company.locationIds.map((locId, i) => ({ id: locId, name: company.locations[i] ?? locId })),
  );
  const [addresses, setAddresses] = React.useState((company.addresses ?? []).join('\n'));
  const [suburbsAndPostcodes, setSuburbsAndPostcodes] = React.useState(
    (company.suburbsAndPostcodes ?? []).join('\n'),
  );
  const [website, setWebsite] = React.useState(company.website ?? '');
  const [seekJobMarketUrl, setSeekJobMarketUrl] = React.useState(company.seekJobMarketUrl ?? '');
  const [linkedinJobMarketUrl, setLinkedinJobMarketUrl] = React.useState(
    company.linkedinJobMarketUrl ?? '',
  );
  const [generalDescription, setGeneralDescription] = React.useState(
    company.generalDescription ?? '',
  );
  // Purely a display toggle for the links row below — not part of isDirty.
  const [editingLinks, setEditingLinks] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const locationIdsKey = (ids: string[]) => [...ids].sort().join(',');
  const initialLocationIdsKey = locationIdsKey(company.locationIds);
  const initialAddresses = (company.addresses ?? []).join('\n');
  const initialSuburbs = (company.suburbsAndPostcodes ?? []).join('\n');

  const isDirty =
    companyName !== company.companyName ||
    industryId !== company.industryId ||
    specializationId !== (company.specializationId ?? '') ||
    locationIdsKey(locations.map((l) => l.id)) !== initialLocationIdsKey ||
    addresses !== initialAddresses ||
    suburbsAndPostcodes !== initialSuburbs ||
    website !== (company.website ?? '') ||
    seekJobMarketUrl !== (company.seekJobMarketUrl ?? '') ||
    linkedinJobMarketUrl !== (company.linkedinJobMarketUrl ?? '') ||
    generalDescription !== (company.generalDescription ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty && canEdit);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
  };

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }

  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });
  async function handleCreateSpecialization(name: string) {
    const res = await createSpecialization.mutateAsync({ data: { name, industryId } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);

  const { data: contactHistoryData } = useGetClientContactHistory(company.id);
  const contactHistory = contactHistoryData?.status === 200 ? contactHistoryData.data : [];

  const updateCompany = useUpdateClient({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Company updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });

  const deleteCompany = useDeleteClient();
  const restoreCompany = useRestoreClient();

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(
    () => formRef.current?.requestSubmit(),
    canEdit && isDirty && !updateCompany.isPending,
  );

  const { data: stakeholdersData } = useGetStakeholders({ clientId: company.id, pageSize: 50 });
  const stakeholders = stakeholdersData?.status === 200 ? stakeholdersData.data.data : [];

  const [logContactOpen, setLogContactOpen] = React.useState(false);
  const [logContactStakeholderId, setLogContactStakeholderId] = React.useState('');
  const addStakeholderContactHistory = useAddStakeholderContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientContactHistoryQueryKey(company.id) });
        queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
        toast.success('Contact logged');
        setLogContactOpen(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });
  const stakeholderOptions = stakeholders.map((s) => ({
    value: s.id,
    label: [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed contact',
  }));
  function handleLogContactOpenChange(open: boolean) {
    if (open) setLogContactStakeholderId('');
    setLogContactOpen(open);
  }
  function handleLogContact(values: LogContactValues) {
    if (!logContactStakeholderId) return;
    addStakeholderContactHistory.mutate({
      id: logContactStakeholderId,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      } as unknown as CreateStakeholderContactHistoryDto,
    });
  }

  // No per-record "owning consultant" on Client (deliberately removed —
  // see the SCOPING note in schema.prisma). The closest real answer to "who's
  // dealing with this company" is whoever's on this client's job orders.
  const { data: jobOrdersData } = useGetJobOrders({ clientId: company.id, pageSize: 50 });
  const jobOrders = jobOrdersData?.status === 200 ? jobOrdersData.data.data : [];
  const dealingConsultants = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const jo of jobOrders) {
      for (const c of jo.consultants) byId.set(c.id, c.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [jobOrders]);

  const { data: jobResearchData } = useGetJobResearch({ clientId: company.id, pageSize: 50 });
  const jobResearch = jobResearchData?.status === 200 ? jobResearchData.data.data : [];

  const { data: tobsData } = useGetTobs({ clientId: company.id, pageSize: 50 });
  const tobs = tobsData?.status === 200 ? tobsData.data.data : [];

  const [addTobOpen, setAddTobOpen] = React.useState(false);
  const createTob = useCreateTob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTobsQueryKey() });
        toast.success('TOB filed');
        setAddTobOpen(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to file TOB'),
    },
  });
  function handleAddTob(values: AddTobValues) {
    createTob.mutate({ data: { clientId: company.id, ...values } as unknown as CreateTobDto });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: UpdateClientDto = {
      companyName,
      industryId,
      specializationId: specializationId || undefined,
      locationIds: locations.map((l) => l.id),
      addresses: addresses
        ? addresses
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      suburbsAndPostcodes: suburbsAndPostcodes
        ? suburbsAndPostcodes
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      website: website || undefined,
      seekJobMarketUrl: seekJobMarketUrl || undefined,
      linkedinJobMarketUrl: linkedinJobMarketUrl || undefined,
      generalDescription: generalDescription || undefined,
    };
    updateCompany.mutate({ id: company.id, data });
    setEditingLinks(false);
  }

  function handleDelete() {
    setDeleteConfirmOpen(false);
    const name = company.companyName;
    // Client has a real backend restore endpoint — restore mode: the delete
    // commits right away and Undo calls restoreClient.
    deleteWithUndo({
      label: name,
      deleteFn: async () => {
        await deleteCompany.mutateAsync({ id: company.id });
      },
      restoreFn: async () => {
        await restoreCompany.mutateAsync({ id: company.id });
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
    });
    router.push('/companies');
  }

  const currentStatus = statusOptions.find((o) => o.value === company.status)!;
  const currentQuality = qualityOptions.find((o) => o.value === company.quality)!;

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/companies" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Companies
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(company.companyName)}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {company.companyName}
                </h1>
                <Badge className={currentStatus.triggerClassName}>{currentStatus.label}</Badge>
                <Badge className={currentQuality.triggerClassName}>{currentQuality.label}</Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {company.displayId} · {company.industry ?? 'No industry'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
            {canEdit ? (
              <div className="flex items-center gap-3">
                {isDirty && !updateCompany.isPending ? (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                ) : null}
                <Button
                  type="submit"
                  form="company-form"
                  size="lg"
                  disabled={updateCompany.isPending || !isDirty}
                >
                  {updateCompany.isPending ? (
                    'Saving…'
                  ) : (
                    <>
                      Save changes
                      {isDirty ? (
                        <span className="flex items-center gap-0.5">
                          <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
                            {isMac ? '⌘' : 'Ctrl'}
                          </Kbd>
                          <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
                            <CornerDownLeft className="size-2.5" />
                          </Kbd>
                        </span>
                      ) : null}
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <form
        id="company-form"
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={blockImplicitEnterSubmit}
        className="grid gap-5 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Contact history</CardTitle>
              <CardDescription>
                Every logged contact, across all of this company's stakeholders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contactHistory.length === 0 && !canEdit ? (
                <p className="p-4 text-sm text-muted-foreground">No contact logged yet.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>Content</TableHead>
                        <TableHead>With</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactHistory.map((row) => (
                        <TableRow key={row.id} className="divide-x divide-border">
                          <TableCell className="max-w-xs whitespace-normal break-words">
                            {row.notes ? (
                              <p className="whitespace-pre-wrap">{row.notes}</p>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">{row.stakeholderName}</TableCell>
                          <TableCell>
                            {contactDateFormatter.format(new Date(row.contactedAt))}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {row.contactedById ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <ConsultantAvatar
                                  consultantId={row.contactedById}
                                  name={consultantLabelFor(row.contactedById)}
                                  size={5}
                                />
                                <span className="truncate">
                                  {consultantLabelFor(row.contactedById)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Imported</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {canEdit ? (
                        <LogContactRow
                          colSpan={4}
                          open={logContactOpen}
                          onOpenChange={handleLogContactOpenChange}
                          triggerDisabled={stakeholders.length === 0}
                          isSaving={addStakeholderContactHistory.isPending}
                          onSave={handleLogContact}
                          subjectPicker={{
                            label: 'Stakeholder',
                            placeholder: 'Pick a stakeholder…',
                            options: stakeholderOptions,
                            value: logContactStakeholderId,
                            onValueChange: setLogContactStakeholderId,
                          }}
                        />
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex border-b flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Contact className="size-4 text-muted-foreground" />
                  Stakeholders
                </CardTitle>
              </div>
              {canEdit && stakeholders.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleLogContactOpenChange(true)}
                >
                  <Phone />
                  Log Contact History
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {stakeholders.length > 0 ? (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>Name</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Latest Contact Date</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stakeholders.map((s) => (
                        <TableRow key={s.id} className="divide-x divide-border">
                          <TableCell className="whitespace-normal">
                            <Link
                              href={`/stakeholders/${s.id}`}
                              className="text-foreground hover:underline"
                            >
                              {[s.firstName, s.lastName].filter(Boolean).join(' ') ||
                                'Unnamed contact'}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.roleType ? (
                              <Badge variant="muted">{s.roleType}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.lastContactedById ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <ConsultantAvatar
                                  consultantId={s.lastContactedById}
                                  name={s.lastContactedBy ?? undefined}
                                  size={5}
                                />
                                <span className="truncate">{s.lastContactedBy}</span>
                              </div>
                            ) : s.lastContactedAt ? (
                              <span className="text-muted-foreground">Imported</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {s.lastContactedAt ? (
                              contactDateFormatter.format(new Date(s.lastContactedAt))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <StakeholderActionsMenu
                                email={s.email}
                                mobile={s.mobile}
                                linkedinUrl={s.linkedinUrl}
                                website={company.website}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No stakeholders logged for this company yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Job Opening Research History</CardTitle>
            </CardHeader>
            <CardContent>
              {jobResearch.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No research logged yet.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>Position</TableHead>
                        <TableHead>Role Type</TableHead>
                        <TableHead>Posted Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Links</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobResearch.map((row) => (
                        <TableRow key={row.id} className="divide-x divide-border">
                          <TableCell className="whitespace-normal">
                            {row.jobTitle ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {row.jobRoleType ? (
                              <Badge variant="muted">{row.jobRoleType}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatJobResearchDate(row.postedDate)}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {row.location ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {row.seekUrl || row.permanentUrl ? (
                              <div className="flex items-center gap-2">
                                {row.seekUrl ? (
                                  <a
                                    href={row.seekUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Seek listing"
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <SeekIcon className="size-3.5" />
                                  </a>
                                ) : null}
                                {row.permanentUrl ? (
                                  <a
                                    href={row.permanentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="LinkedIn listing"
                                    className="text-muted-foreground hover:text-[#0A66C2]"
                                  >
                                    <LinkedinIcon className="size-3.5" />
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex border-b flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Terms of Business
              </CardTitle>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddTobOpen(true)}
                >
                  <Plus />
                  Add TOB
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {tobs.length === 0 && !canEdit ? (
                <p className="text-sm text-muted-foreground">No TOBs filed for this company yet.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>TOB ID</TableHead>
                        <TableHead>Pricing</TableHead>
                        <TableHead>Guarantee Period (days)</TableHead>
                        <TableHead>Payment terms</TableHead>
                        <TableHead>Client rep</TableHead>
                        <TableHead>Linktal rep</TableHead>
                        <TableHead>Invoice contact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tobs.map((tob) => (
                        <TableRow key={tob.id} className="divide-x divide-border">
                          <TableCell className="font-mono text-xs">
                            {tob.sourceFileLink ? (
                              <a
                                href={tob.sourceFileLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground hover:underline"
                              >
                                {tob.displayId}
                              </a>
                            ) : (
                              <span className="text-muted-foreground" title="No file on file">
                                {tob.displayId}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tob.pricing ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {tob.guaranteePeriod ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tob.paymentTerm ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tob.clientTobRepresentative ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tob.linktalRepresentativeId ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <ConsultantAvatar
                                  consultantId={tob.linktalRepresentativeId}
                                  name={tob.linktalRepresentative ?? undefined}
                                  size={5}
                                />
                                <span className="truncate">{tob.linktalRepresentative}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tob.invoiceContactName || tob.invoiceContactEmail ? (
                              <div className="flex flex-col">
                                <span>{tob.invoiceContactName ?? '—'}</span>
                                {tob.invoiceContactEmail ? (
                                  <span className="text-xs text-muted-foreground">
                                    {tob.invoiceContactEmail}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {canEdit ? (
                        <AddTobRow
                          colSpan={7}
                          open={addTobOpen}
                          onOpenChange={setAddTobOpen}
                          consultants={consultants}
                          isSaving={createTob.isPending}
                          onSave={handleAddTob}
                        />
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                label="Company name"
                htmlFor="companyName"
                required
                orientation="horizontal"
              >
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Industry" htmlFor="industry" required orientation="horizontal">
                <CreatableCombobox
                  id="industry"
                  value={industryId}
                  onValueChange={(id) => {
                    setIndustryId(id);
                    setSpecializationId('');
                  }}
                  options={industries}
                  onCreate={handleCreateIndustry}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField
                label="Specialization"
                htmlFor="specialization"
                description={!industryId ? 'Pick an industry first' : undefined}
                orientation="horizontal"
              >
                <SpecializationCombobox
                  id="specialization"
                  value={specializationId}
                  label={company.specialization ?? undefined}
                  onValueChange={setSpecializationId}
                  industryId={industryId || undefined}
                  onCreate={handleCreateSpecialization}
                  disabled={!canEdit || !industryId}
                  clearable
                />
              </FormField>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Consultants</span>
                {dealingConsultants.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {dealingConsultants.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 rounded-full bg-muted/50 py-1 pr-2.5 pl-1 text-sm"
                      >
                        <ConsultantAvatar consultantId={c.id} name={c.name} size={5} />
                        <span>{c.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    None yet — assigned via this company's job orders.
                  </p>
                )}
              </div>
              <Collapsible.Root
                open={editingLinks}
                onOpenChange={setEditingLinks}
                className="group/links flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Website</span>
                  <div className="flex items-center gap-1">
                    <LinkIconButton icon={Globe} url={website} label="Website" />
                    <LinkIconButton
                      icon={LinkedinIcon}
                      url={linkedinJobMarketUrl}
                      label="LinkedIn job market"
                      activeClassName="text-[#0A66C2]"
                    />
                    <LinkIconButton icon={SeekIcon} url={seekJobMarketUrl} label="Seek/JobStreet" />
                    {canEdit ? (
                      <Collapsible.Trigger
                        render={
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label={editingLinks ? 'Collapse links' : 'Expand links'}
                          >
                            <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[panel-open]/links:rotate-180" />
                          </button>
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <Collapsible.Panel className="flex flex-col gap-3 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
                  <FormField label="Company Website" htmlFor="website" orientation="horizontal">
                    <UrlField
                      id="website"
                      value={website}
                      onChange={setWebsite}
                      disabled={!canEdit}
                      icon={Globe}
                    />
                  </FormField>
                  <FormField
                    label="LinkedIn Job Market URL"
                    htmlFor="linkedinJobMarketUrl"
                    orientation="horizontal"
                  >
                    <UrlField
                      id="linkedinJobMarketUrl"
                      value={linkedinJobMarketUrl}
                      onChange={setLinkedinJobMarketUrl}
                      disabled={!canEdit}
                      icon={LinkedinIcon}
                    />
                  </FormField>
                  <FormField
                    label="Seek/JobStreet URL"
                    htmlFor="seekJobMarketUrl"
                    orientation="horizontal"
                  >
                    <UrlField
                      id="seekJobMarketUrl"
                      value={seekJobMarketUrl}
                      onChange={setSeekJobMarketUrl}
                      disabled={!canEdit}
                      icon={SeekIcon}
                    />
                  </FormField>
                </Collapsible.Panel>
              </Collapsible.Root>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Market</CardTitle>
            </CardHeader>
            <CardContent>
              <LocationMultiSelect
                selected={locations}
                onChange={setLocations}
                disabled={!canEdit}
              />
            </CardContent>
            <CardContent className="grid gap-4 border-t pt-4">
              <div>
                <span className="text-sm font-medium">Office addresses</span>
              </div>
              <FormField
                label="Address(es)"
                htmlFor="addresses"
                description="One per line."
                orientation="horizontal"
              >
                <textarea
                  id="addresses"
                  value={addresses}
                  onChange={(e) => setAddresses(e.target.value)}
                  disabled={!canEdit}
                  className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                />
              </FormField>
              <FormField
                label="Suburbs / postcodes"
                htmlFor="suburbsAndPostcodes"
                description="One per line."
                orientation="horizontal"
              >
                <textarea
                  id="suburbsAndPostcodes"
                  value={suburbsAndPostcodes}
                  onChange={(e) => setSuburbsAndPostcodes(e.target.value)}
                  disabled={!canEdit}
                  className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Description About This Company</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField label="" htmlFor="generalDescription">
                <textarea
                  id="generalDescription"
                  value={generalDescription}
                  onChange={(e) => setGeneralDescription(e.target.value)}
                  disabled={!canEdit}
                  className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </form>

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${company.companyName}?`}
        description="This removes the company. You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleDelete}
      />

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving now discards your unsaved changes to this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
