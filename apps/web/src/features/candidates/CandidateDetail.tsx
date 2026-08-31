'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CornerDownLeft,
  Mail,
  Phone,
  Pencil,
  X,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LinkedinIcon, SeekIcon } from '@/components/BrandIcons';
import { useConsultantLookup } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { FileUploadField } from '@/components/FileUploadField';
import { ChangeDot, FormField } from '@/components/FormField';
import { MultiFileUploadField, type DocumentFile } from '@/components/MultiFileUploadField';
import { WorkHistoryField, type WorkHistoryItem } from '@/components/WorkHistoryField';
import { LocationCombobox, type LocationValue } from '@/components/LocationCombobox';
import {
  LogCandidateContactRow,
  type LogCandidateContactValues,
} from '@/components/LogCandidateContactRow';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { cn } from '@/lib/utils';
import {
  useGetCandidate,
  useUpdateCandidate,
  useGetCandidateContactHistory,
  useAddCandidateContactHistory,
  useUpdateCandidateContactHistory,
  getGetCandidatesQueryKey,
  getGetCandidateQueryKey,
  getGetCandidateContactHistoryQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useUploadCandidateFile } from '@/lib/api/generated/uploads/uploads';
import { useGetJobOrders } from '@/lib/api/generated/job-orders/job-orders';
import { getGetInterviewsQueryOptions } from '@/lib/api/generated/interviews/interviews';
import { getGetPlacementsQueryOptions } from '@/lib/api/generated/placements/placements';
import { useGetSubmissions } from '@/lib/api/generated/submissions/submissions';
import {
  getGetJobRoleTypesQueryKey,
  useCreateJobRoleType,
  useGetJobRoleTypes,
} from '@/lib/api/generated/job-role-types/job-role-types';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
  useGetIndustries,
} from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useGetSpecializations,
} from '@/lib/api/generated/specializations/specializations';
import type {
  CreateCandidateContactHistoryDto,
  SubmissionEntity,
  UpdateCandidateDto,
} from '@/lib/api/generated/types';
import { contactCategoryLabels, outreachChannelLabels } from '@/lib/candidate-contact-category';
import {
  candidateFullName,
  type Candidate,
  candidateStatusLabels,
  candidateStatusVariants,
} from './schema';

const contactDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** A contact-history row's own last-modified marker — mirrors the API's version check, used for the optimistic-concurrency check on edit. */
function contactHistoryVersion(row: { editedAt: string | null; createdAt: string }) {
  return row.editedAt ?? row.createdAt;
}

function isConflictError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 409
  );
}

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function CandidateDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useGetCandidate(id);
  const candidate = data?.status === 200 ? data.data : undefined;

  if (isLoading) {
    return (
      <PageLayout>
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageLayout>
    );
  }

  if (isError || !candidate) {
    return (
      <PageLayout>
        <PageHeader
          title="Candidate not found"
          description={error?.message ?? `No candidate with ID ${id}.`}
        />
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/candidates" />}>
            <ArrowLeft />
            Back to candidates
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount the form when a different candidate loads so RHF's
  // defaultValues reset.
  return <CandidateEditForm key={candidate.id} candidate={candidate} />;
}

/** Empty strings become undefined so PATCH omits (not clears) blank fields. */
function cleanPatch(values: UpdateCandidateDto): UpdateCandidateDto {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)),
    ),
  ) as UpdateCandidateDto;
}

/** True when two id arrays hold the same set, ignoring order. */
function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

/** Candidate.historicFiles/otherDocuments come back as `Prisma.JsonValue` (unknown shape at the type level) — narrow to the `{key, fileName}[]` this page actually writes. */
function asDocumentFiles(value: unknown): DocumentFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is DocumentFile =>
      !!v && typeof v === 'object' && typeof (v as DocumentFile).key === 'string' && typeof (v as DocumentFile).fileName === 'string',
  );
}

/** True when two file lists hold the same keys in the same order. */
function sameFiles(a: DocumentFile[], b: DocumentFile[]) {
  if (a.length !== b.length) return false;
  return a.every((f, i) => f.key === b[i]?.key && f.fileName === b[i]?.fileName);
}

/** Candidate.workHistory comes back as `Prisma.JsonValue` (unknown shape at the type level) — narrow to the `{role, company, period}[]` this page reads and writes. */
function asWorkHistory(value: unknown): WorkHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const item = v as { role?: unknown; company?: unknown; period?: unknown };
    return {
      role: typeof item?.role === 'string' ? item.role : undefined,
      company: typeof item?.company === 'string' ? item.company : undefined,
      period: typeof item?.period === 'string' ? item.period : undefined,
    };
  });
}

/** True when two work-history lists hold the same entries in the same order. */
function sameWorkHistory(a: WorkHistoryItem[], b: WorkHistoryItem[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.role === b[i]?.role && item.company === b[i]?.company && item.period === b[i]?.period,
  );
}

/** One icon per contact method (Email/Mobile/LinkedIn/Seek Talent) — click opens it. A method with no value on file renders greyed-out and inert rather than being hidden, so the icon row's position doesn't shift. Mirrors CompanyDetail's LinkIconButton for its Website field. */
function ContactIconButton({
  icon: Icon,
  href,
  label,
  activeClassName = 'text-muted-foreground hover:text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  href?: string | null;
  label: string;
  activeClassName?: string;
}) {
  const disabled = !href;
  return (
    <a
      href={href ?? undefined}
      target={
        href && !href.startsWith('mailto:') && !href.startsWith('tel:') ? '_blank' : undefined
      }
      rel="noopener noreferrer"
      aria-disabled={disabled}
      onClick={disabled ? (e) => e.preventDefault() : undefined}
      title={disabled ? `No ${label.toLowerCase()} on file` : label}
      aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Open ${label.toLowerCase()}`}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground'
          : cn(activeClassName, 'hover:bg-accent'),
      )}
    >
      <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
    </a>
  );
}

function copyValue(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
  );
}

/** Same look as ContactIconButton, but copies to the clipboard instead of navigating — for Mobile, which has no useful direct-interact link (no tel: dialer on desktop). */
function ContactCopyButton({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
}) {
  const disabled = !value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => value && copyValue(value, label)}
      title={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
      aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        disabled ? 'cursor-not-allowed' : 'hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
    </button>
  );
}

function CandidateEditForm({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);
  const { data: session } = useSession();

  const { data: jobOrdersData } = useGetJobOrders({ pageSize: 100 });
  const jobOrders = jobOrdersData?.status === 200 ? jobOrdersData.data.data : [];
  const jobOrderById = React.useMemo(() => new Map(jobOrders.map((j) => [j.id, j])), [jobOrders]);

  // Mirrors the server-side check in CandidatesService.updateContactHistory —
  // only a SCREENING row has editable content, and only its own author (or
  // an admin) may edit it.
  const canEditContactHistory = (row: { category: string; contactedById: string | null }) =>
    row.category === 'SCREENING' &&
    (row.contactedById === session?.user?.consultantId || session?.user?.roleName === 'admin');

  const { register, handleSubmit, formState, reset } = useForm<UpdateCandidateDto>({
    defaultValues: {
      firstName: candidate.firstName ?? '',
      lastName: candidate.lastName ?? '',
      email: candidate.email ?? '',
      mobile: candidate.mobile ?? '',
      linkedinUrl: candidate.linkedinUrl ?? '',
      seekTalentUrl: candidate.seekTalentUrl ?? '',
      currentSalary: candidate.currentSalary ?? '',
      expectedSalary: candidate.expectedSalary ?? '',
      suburbAndPostcode: candidate.suburbAndPostcode ?? '',
    },
  });

  // Industry/role type/specializations/resumes are reference-table pickers
  // or uploads, not plain registered inputs — tracked as their own state
  // (like CompanyDetail's industryId/specializationId) and merged into the
  // patch on submit, since RHF's dirty-tracking doesn't see them.
  const [industryId, setIndustryId] = React.useState(candidate.industryId ?? '');
  const [roleTypeId, setRoleTypeId] = React.useState(candidate.jobRoleTypeId ?? '');
  const [specializationIds, setSpecializationIds] = React.useState(candidate.specializationIds);
  const [location, setLocation] = React.useState<LocationValue | null>(
    candidate.locationId
      ? { id: candidate.locationId, name: candidate.location ?? candidate.locationId }
      : null,
  );
  const [rawResumeUrl, setRawResumeUrl] = React.useState(candidate.rawResumeUrl ?? '');
  const [editedResumeUrl, setEditedResumeUrl] = React.useState(candidate.editedResumeUrl ?? '');
  const [historicFiles, setHistoricFiles] = React.useState<DocumentFile[]>(
    asDocumentFiles(candidate.historicFiles),
  );
  const [otherDocuments, setOtherDocuments] = React.useState<DocumentFile[]>(
    asDocumentFiles(candidate.otherDocuments),
  );
  const [workHistory, setWorkHistory] = React.useState<WorkHistoryItem[]>(
    asWorkHistory(candidate.workHistory),
  );
  // Purely a display toggle for the Contact row below — not part of isDirty.
  const [editingContact, setEditingContact] = React.useState(false);

  // Field names that were part of the most recently *successful* save —
  // drives the brief green "saved" flash on each changed field's indicator
  // before it fades back to no-indicator. Cleared on a timer, not tied to
  // React Query's cache state, so it reads as a confirmation of that one
  // save rather than a live "is this in sync with the server" check.
  const [justSavedFields, setJustSavedFields] = React.useState<Set<string>>(new Set());

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const { data: roleTypeData } = useGetJobRoleTypes();
  const roleTypes = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const { data: specializationData } = useGetSpecializations();
  const specializations = specializationData?.status === 200 ? specializationData.data : [];
  const specializationById = React.useMemo(
    () => new Map(specializations.map((s) => [s.id, s])),
    [specializations],
  );

  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  const createRoleType = useCreateJobRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetJobRoleTypesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });

  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }
  async function handleCreateSpecialization(name: string) {
    // A Specialization belongs to exactly one Industry — can't create one
    // without knowing which.
    if (!industryId) throw new Error('Select an industry first');
    const res = await createSpecialization.mutateAsync({ data: { name, industryId } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  // Named individually (rather than inlined straight into isDirty) so each
  // one can also drive its own field's change indicator.
  const industryChanged = industryId !== (candidate.industryId ?? '');
  const roleTypeChanged = roleTypeId !== (candidate.jobRoleTypeId ?? '');
  const specializationsChanged = !sameIds(specializationIds, candidate.specializationIds);
  const locationChanged = (location?.id ?? '') !== (candidate.locationId ?? '');
  const rawResumeChanged = rawResumeUrl !== (candidate.rawResumeUrl ?? '');
  const editedResumeChanged = editedResumeUrl !== (candidate.editedResumeUrl ?? '');
  const historicFilesChanged = !sameFiles(historicFiles, asDocumentFiles(candidate.historicFiles));
  const otherDocumentsChanged = !sameFiles(otherDocuments, asDocumentFiles(candidate.otherDocuments));
  const workHistoryChanged = !sameWorkHistory(workHistory, asWorkHistory(candidate.workHistory));

  const isDirty =
    formState.isDirty ||
    industryChanged ||
    roleTypeChanged ||
    specializationsChanged ||
    locationChanged ||
    rawResumeChanged ||
    editedResumeChanged ||
    historicFilesChanged ||
    otherDocumentsChanged ||
    workHistoryChanged;

  // 'dirty' (amber) while changed-but-unsaved, 'saved' (green) for a brief
  // flash right after a successful save, undefined otherwise — see
  // FormField's `changeState` prop.
  function fieldChangeState(name: string, dirty: boolean): 'dirty' | 'saved' | undefined {
    if (justSavedFields.has(name)) return 'saved';
    if (dirty) return 'dirty';
    return undefined;
  }

  const uploadCandidateFile = useUploadCandidateFile();
  async function handleUploadFile(file: File) {
    // customFetch throws on any non-2xx response, so a resolved call is
    // always the 201 envelope — this guard is just for TypeScript's
    // discriminated-union narrowing (same as ImportDialog's `upload` prop).
    const res = await uploadCandidateFile.mutateAsync({ data: { file } });
    if (res.status !== 201) throw new Error('Upload failed');
    return res.data;
  }

  const updateCandidate = useUpdateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetCandidateQueryKey(candidate.id),
        });
        toast.success(`Saved changes to ${candidateFullName(candidate) || 'candidate'}`);
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to save candidate');
      },
    },
  });

  const flashTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  const onSubmit = handleSubmit((values) => {
    // Snapshot which fields are actually changing in *this* submit, before
    // the mutation resolves and dirty state starts clearing out from under
    // us — this is the exact set that gets the green "saved" flash.
    const changedFields = new Set<string>(Object.keys(formState.dirtyFields));
    if (industryChanged) changedFields.add('industryId');
    if (roleTypeChanged) changedFields.add('roleTypeId');
    if (specializationsChanged) changedFields.add('specializationIds');
    if (locationChanged) changedFields.add('location');
    if (rawResumeChanged) changedFields.add('rawResumeUrl');
    if (editedResumeChanged) changedFields.add('editedResumeUrl');
    if (historicFilesChanged) changedFields.add('historicFiles');
    if (otherDocumentsChanged) changedFields.add('otherDocuments');
    if (workHistoryChanged) changedFields.add('workHistory');

    updateCandidate.mutate(
      {
        id: candidate.id,
        data: {
          ...cleanPatch(values),
          industryId: industryId || null,
          jobRoleTypeId: roleTypeId || null,
          specializationIds,
          locationId: location?.id ?? candidate.locationId,
          rawResumeUrl: rawResumeUrl || null,
          editedResumeUrl: editedResumeUrl || null,
          historicFiles,
          otherDocuments,
          workHistory,
        } as UpdateCandidateDto,
      },
      {
        onSuccess: () => {
          // Clears RHF's own dirty tracking (it only resets via `reset`, never
          // on its own) so a saved field's indicator can fall back to "no
          // indicator" once the flash below ends, instead of reverting to
          // "unsaved" the moment the flash clears.
          reset(values);
          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          setJustSavedFields(changedFields);
          flashTimeoutRef.current = setTimeout(() => setJustSavedFields(new Set()), 2000);
        },
      },
    );
    setEditingContact(false);
  });

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(() => formRef.current?.requestSubmit(), isDirty && !updateCandidate.isPending);
  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  const [loggingContact, setLoggingContact] = React.useState(false);
  const contactHistoryQueryKey = getGetCandidateContactHistoryQueryKey(candidate.id);
  const { data: contactHistoryData } = useGetCandidateContactHistory(candidate.id);
  const contactHistory = contactHistoryData?.status === 200 ? contactHistoryData.data : [];

  const addContactHistory = useAddCandidateContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        queryClient.invalidateQueries({ queryKey: contactHistoryQueryKey });
        toast.success('Contact logged');
        setLoggingContact(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });

  function handleLogContact(values: LogCandidateContactValues) {
    addContactHistory.mutate({
      id: candidate.id,
      data: {
        contactType: values.contactType,
        category: values.category,
        contactedAt: values.contactedAt,
        ...(values.screeningNotes ? { screeningNotes: values.screeningNotes } : {}),
        ...(values.outreachCampaignNotes
          ? { outreachCampaignNotes: values.outreachCampaignNotes }
          : {}),
        ...(values.outreachChannel ? { outreachChannel: values.outreachChannel } : {}),
        ...(values.currentSalary ? { currentSalary: values.currentSalary } : {}),
        ...(values.expectedSalary ? { expectedSalary: values.expectedSalary } : {}),
      } as unknown as CreateCandidateContactHistoryDto,
    });
  }

  const [editingContactId, setEditingContactId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [editingContactVersion, setEditingContactVersion] = React.useState<string | null>(null);

  const updateContactHistory = useUpdateCandidateContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: contactHistoryQueryKey });
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        setEditingContactId(null);
      },
      onError: (err) => {
        if (isConflictError(err)) {
          queryClient.invalidateQueries({ queryKey: contactHistoryQueryKey });
          setEditingContactId(null);
          toast.error(
            'This contact was changed by someone else. Refreshed with the latest version.',
          );
          return;
        }
        toast.error(err.message || 'Failed to edit contact');
      },
    },
  });

  function startEditingContact(row: {
    id: string;
    screeningNotes: string | null;
    editedAt: string | null;
    createdAt: string;
  }) {
    setEditingContactId(row.id);
    setEditDraft(row.screeningNotes ?? '');
    setEditingContactVersion(contactHistoryVersion(row));
  }

  function handleSaveContactEdit(e: React.SyntheticEvent, contactHistoryId: string) {
    e.preventDefault();
    const screeningNotes = editDraft.trim();
    if (!screeningNotes) return;
    updateContactHistory.mutate({
      id: candidate.id,
      contactHistoryId,
      data: { screeningNotes, expectedVersion: editingContactVersion ?? undefined },
    });
  }

  // Interview Histories: one row per job-order submission — Client/Role come
  // from the job order (a submission carries no client of its own), interview
  // and placement dates come from per-submission lookups (neither endpoint
  // supports a batch-by-candidate filter, only submissionId).
  const { data: submissionsData } = useGetSubmissions({ candidateId: candidate.id });
  const submissions: SubmissionEntity[] =
    submissionsData?.status === 200 ? submissionsData.data : [];

  const interviewQueries = useQueries({
    queries: submissions.map((s) => getGetInterviewsQueryOptions({ submissionId: s.id })),
  });
  const placementQueries = useQueries({
    queries: submissions.map((s) => getGetPlacementsQueryOptions({ submissionId: s.id })),
  });

  const interviewRows = submissions.map((submission, i) => {
    const jobOrder = jobOrderById.get(submission.jobOrderId);
    const interviewsRes = interviewQueries[i]?.data;
    const interviews = interviewsRes?.status === 200 ? interviewsRes.data : [];
    const latestInterview = interviews.length
      ? interviews.reduce((a, b) => (new Date(a.interviewDate) > new Date(b.interviewDate) ? a : b))
      : null;
    const placementsRes = placementQueries[i]?.data;
    const placements = placementsRes?.status === 200 ? placementsRes.data : [];
    const placement = placements[0];
    return {
      submissionId: submission.id,
      client: jobOrder?.clientName ?? '—',
      role: jobOrder?.jobTitle ?? jobOrder?.jobRoleType ?? submission.jobOrderTitle ?? '—',
      submittedAt: submission.submittedAt,
      interviewedAt: latestInterview?.interviewDate ?? null,
      placedStartDate: submission.status === 'PLACED' ? (placement?.startDate ?? null) : null,
    };
  });

  const contactActionsMenu = (
    <div className="flex items-center gap-1">
      <ContactIconButton
        icon={Mail}
        href={candidate.email ? `mailto:${candidate.email}` : null}
        label="Email"
      />
      <ContactCopyButton icon={Phone} value={candidate.mobile} label="Mobile" />
      <ContactIconButton
        icon={LinkedinIcon}
        href={candidate.linkedinUrl}
        label="LinkedIn"
        activeClassName="text-[#0A66C2]"
      />
      <ContactIconButton icon={SeekIcon} href={candidate.seekTalentUrl} label="Seek Talent" />
    </div>
  );

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/candidates" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Candidates
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(candidateFullName(candidate))}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {candidateFullName(candidate) || 'Unnamed candidate'}
                </h1>
                <Badge variant={candidateStatusVariants[candidate.status]}>
                  {candidateStatusLabels[candidate.status]}
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{candidate.displayId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !updateCandidate.isPending ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button
              type="submit"
              form="candidate-form"
              size="lg"
              disabled={updateCandidate.isPending || !isDirty}
            >
              {updateCandidate.isPending ? (
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
        </div>
      </div>

      <form
        id="candidate-form"
        ref={formRef}
        onSubmit={onSubmit}
        onKeyDown={blockImplicitEnterSubmit}
        className="grid gap-5 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex border-b flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">Contact Histories</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoggingContact(true)}
              >
                <Phone />
                Log Contact
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="divide-x divide-border">
                      <TableHead>Content</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactHistory.map((row) => (
                      <TableRow key={row.id} className="divide-x divide-border">
                        <TableCell className="group max-w-md whitespace-normal break-words">
                          {editingContactId === row.id ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                aria-label="Edit screening notes"
                                className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                autoFocus
                              />
                              <div className="flex items-center gap-2 self-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setEditingContactId(null)}
                                  aria-label="Cancel edit"
                                >
                                  <X />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  disabled={updateContactHistory.isPending || !editDraft.trim()}
                                  onClick={(e) => handleSaveContactEdit(e, row.id)}
                                  aria-label="Save edit"
                                >
                                  <Check />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="muted">
                                    {contactCategoryLabels[row.category]}
                                  </Badge>
                                  {row.category === 'OUTREACH' && row.outreachChannel ? (
                                    <Badge variant="muted">
                                      {outreachChannelLabels[row.outreachChannel]}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="whitespace-pre-wrap">
                                  {row.category === 'SCREENING'
                                    ? (row.screeningNotes ?? '—')
                                    : (row.outreachCampaignNotes ?? '—')}
                                </p>
                              </div>
                              {canEditContactHistory(row) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                  onClick={() => startEditingContact(row)}
                                  aria-label="Edit screening notes"
                                >
                                  <Pencil />
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {contactDateFormatter.format(new Date(row.contactedAt))}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {row.contactedById ? consultantLabelFor(row.contactedById) : 'Imported'}
                          {row.editedAt ? (
                            <span className="block text-xs text-muted-foreground">
                              edited by{' '}
                              {row.editedById ? consultantLabelFor(row.editedById) : 'Imported'}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    <LogCandidateContactRow
                      colSpan={3}
                      open={loggingContact}
                      onOpenChange={setLoggingContact}
                      isSaving={addContactHistory.isPending}
                      onSave={handleLogContact}
                    />
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Interview Histories</CardTitle>
            </CardHeader>
            <CardContent>
              {interviewRows.length > 0 ? (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>Client</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Submitted Date</TableHead>
                        <TableHead>Interviewed Date</TableHead>
                        <TableHead>Placed Starting Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interviewRows.map((row) => (
                        <TableRow key={row.submissionId} className="divide-x divide-border">
                          <TableCell className="whitespace-normal">{row.client}</TableCell>
                          <TableCell className="whitespace-normal">{row.role}</TableCell>
                          <TableCell>
                            {shortDateFormatter.format(new Date(row.submittedAt))}
                          </TableCell>
                          <TableCell>
                            {row.interviewedAt ? (
                              shortDateFormatter.format(new Date(row.interviewedAt))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.placedStartDate ? (
                              shortDateFormatter.format(new Date(row.placedStartDate))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not submitted to any job orders yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Document Base</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border border-border">
                {/* table-fixed + equal-width headers so a long filename truncates
                    inside its own column instead of stretching the table and
                    pushing the other 3 columns out of view. */}
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="divide-x divide-border">
                      <TableHead className="w-1/4">
                        <span className="flex items-center gap-1.5">
                          <ChangeDot state={fieldChangeState('rawResumeUrl', rawResumeChanged)} />
                          Raw Resume
                        </span>
                      </TableHead>
                      <TableHead className="w-1/4">
                        <span className="flex items-center gap-1.5">
                          <ChangeDot state={fieldChangeState('editedResumeUrl', editedResumeChanged)} />
                          Linktal Resume
                        </span>
                      </TableHead>
                      <TableHead className="w-1/4">
                        <span className="flex items-center gap-1.5">
                          <ChangeDot state={fieldChangeState('historicFiles', historicFilesChanged)} />
                          Historic Files
                        </span>
                      </TableHead>
                      <TableHead className="w-1/4">
                        <span className="flex items-center gap-1.5">
                          <ChangeDot state={fieldChangeState('otherDocuments', otherDocumentsChanged)} />
                          Other Documents
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="divide-x divide-border align-top">
                      <TableCell className="whitespace-normal">
                        <FileUploadField
                          id="rawResumeUrl"
                          value={rawResumeUrl}
                          onChange={(url) => setRawResumeUrl(url ?? '')}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <FileUploadField
                          id="editedResumeUrl"
                          value={editedResumeUrl}
                          onChange={(url) => setEditedResumeUrl(url ?? '')}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <MultiFileUploadField
                          id="historicFiles"
                          value={historicFiles}
                          onChange={setHistoricFiles}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <MultiFileUploadField
                          id="otherDocuments"
                          value={otherDocuments}
                          onChange={setOtherDocuments}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="First name"
                  htmlFor="firstName"
                  changeState={fieldChangeState('firstName', !!formState.dirtyFields.firstName)}
                >
                  <Input id="firstName" {...register('firstName')} />
                </FormField>
                <FormField
                  label="Last name"
                  htmlFor="lastName"
                  changeState={fieldChangeState('lastName', !!formState.dirtyFields.lastName)}
                >
                  <Input id="lastName" {...register('lastName')} />
                </FormField>
              </div>
              <FormField
                label="Industry"
                htmlFor="industry"
                required
                orientation="horizontal"
                changeState={fieldChangeState('industryId', industryChanged)}
              >
                <CreatableCombobox
                  id="industry"
                  value={industryId}
                  onValueChange={setIndustryId}
                  options={industries}
                  onCreate={handleCreateIndustry}
                  placeholder="Select industry…"
                />
              </FormField>
              <FormField
                label="Role type"
                htmlFor="roleType"
                orientation="horizontal"
                changeState={fieldChangeState('roleTypeId', roleTypeChanged)}
              >
                <CreatableCombobox
                  id="roleType"
                  value={roleTypeId}
                  onValueChange={setRoleTypeId}
                  options={roleTypes}
                  onCreate={handleCreateRoleType}
                  placeholder="Select role type…"
                />
              </FormField>
              <FormField
                label="Specialization"
                htmlFor="specialization"
                description={!industryId ? 'Pick an industry first' : undefined}
                orientation="horizontal"
                changeState={fieldChangeState('specializationIds', specializationsChanged)}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {specializationIds.length > 0
                      ? specializationIds.map((id) => (
                          <Badge key={id} variant="muted" className="gap-1">
                            {specializationById.get(id)?.name ?? id}
                            <button
                              type="button"
                              aria-label="Remove specialization"
                              onClick={() =>
                                setSpecializationIds((prev) => prev.filter((s) => s !== id))
                              }
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))
                      : null}
                  </div>
                  {/* value is always '' — this is an "add one" picker, not a
                        single-select; onCreate/onValueChange append instead of
                        replacing, and already-selected options are filtered out. */}
                  <CreatableCombobox
                    id="specialization"
                    value=""
                    onValueChange={(id) =>
                      setSpecializationIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                    }
                    options={specializations.filter((s) => !specializationIds.includes(s.id))}
                    onCreate={handleCreateSpecialization}
                    placeholder="Add a specialization…"
                    disabled={!industryId}
                  />
                </div>
              </FormField>

              <Collapsible.Root
                open={editingContact}
                onOpenChange={setEditingContact}
                className="group/contact flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <ChangeDot
                      state={
                        ['email', 'mobile', 'linkedinUrl', 'seekTalentUrl'].some((f) =>
                          justSavedFields.has(f),
                        )
                          ? 'saved'
                          : formState.dirtyFields.email ||
                              formState.dirtyFields.mobile ||
                              formState.dirtyFields.linkedinUrl ||
                              formState.dirtyFields.seekTalentUrl
                            ? 'dirty'
                            : undefined
                      }
                    />
                    Contact
                  </span>
                  <div className="flex items-center gap-1">
                    {contactActionsMenu}
                    <Collapsible.Trigger
                      render={
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={
                            editingContact ? 'Collapse contact fields' : 'Expand contact fields'
                          }
                        >
                          <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[panel-open]/contact:rotate-180" />
                        </button>
                      }
                    />
                  </div>
                </div>
                <Collapsible.Panel className="flex flex-col gap-3 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
                  <FormField
                    label="Email"
                    htmlFor="email"
                    orientation="horizontal"
                    changeState={fieldChangeState('email', !!formState.dirtyFields.email)}
                  >
                    <Input id="email" type="email" {...register('email')} />
                  </FormField>
                  <FormField
                    label="Mobile"
                    htmlFor="mobile"
                    orientation="horizontal"
                    changeState={fieldChangeState('mobile', !!formState.dirtyFields.mobile)}
                  >
                    <Input id="mobile" {...register('mobile')} />
                  </FormField>
                  <FormField
                    label="LinkedIn URL"
                    htmlFor="linkedinUrl"
                    orientation="horizontal"
                    changeState={fieldChangeState(
                      'linkedinUrl',
                      !!formState.dirtyFields.linkedinUrl,
                    )}
                  >
                    <Input id="linkedinUrl" {...register('linkedinUrl')} />
                  </FormField>
                  <FormField
                    label="Seek Talent URL"
                    htmlFor="seekTalentUrl"
                    orientation="horizontal"
                    changeState={fieldChangeState(
                      'seekTalentUrl',
                      !!formState.dirtyFields.seekTalentUrl,
                    )}
                  >
                    <Input id="seekTalentUrl" {...register('seekTalentUrl')} />
                  </FormField>
                </Collapsible.Panel>
              </Collapsible.Root>

              <Separator />

              <FormField
                label="City"
                htmlFor="location"
                orientation="horizontal"
                tooltip="Coarsest location the scope resolver has for this candidate — suburb-level data isn't loaded yet, see Suburb & Postcode below for the free-text version."
                changeState={fieldChangeState('location', locationChanged)}
              >
                <LocationCombobox
                  id="location"
                  value={location}
                  onChange={setLocation}
                  placeholder="Search for a city…"
                />
              </FormField>

              <FormField
                label="Suburb & Postcode"
                htmlFor="suburbAndPostcode"
                orientation="horizontal"
                tooltip='Free text — not searched or scoped, e.g. "Merrylands 2160 NSW".'
                changeState={fieldChangeState(
                  'suburbAndPostcode',
                  !!formState.dirtyFields.suburbAndPostcode,
                )}
              >
                <Input
                  id="suburbAndPostcode"
                  placeholder="e.g. Merrylands 2160 NSW"
                  {...register('suburbAndPostcode')}
                />
              </FormField>

              <FormField
                label="Current salary"
                htmlFor="currentSalary"
                orientation="horizontal"
                changeState={fieldChangeState(
                  'currentSalary',
                  !!formState.dirtyFields.currentSalary,
                )}
              >
                <Input
                  id="currentSalary"
                  placeholder="e.g. 35 per hour"
                  {...register('currentSalary')}
                />
              </FormField>
              <FormField
                label="Expected salary"
                htmlFor="expectedSalary"
                orientation="horizontal"
                changeState={fieldChangeState(
                  'expectedSalary',
                  !!formState.dirtyFields.expectedSalary,
                )}
              >
                <Input
                  id="expectedSalary"
                  placeholder="e.g. 55-60"
                  {...register('expectedSalary')}
                />
              </FormField>
              <p className="text-xs text-muted-foreground">
                Direct edit for fixing incorrect values — logging a new contact still records its
                own salary in history separately.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <ChangeDot state={fieldChangeState('workHistory', workHistoryChanged)} />
                Employment History
              </CardTitle>
              <CardDescription className="flex items-center gap-1 text-xs">
                Scroll horizontally to reveal more
                <ArrowRight className="size-3" />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkHistoryField value={workHistory} onChange={setWorkHistory} />
            </CardContent>
          </Card>
        </div>
      </form>

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader icon={AlertTriangle} iconVariant="warning">
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to {candidateFullName(candidate) || 'this candidate'}.
              Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Leave without saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
