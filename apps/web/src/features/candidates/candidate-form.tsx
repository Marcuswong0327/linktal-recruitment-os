'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateCandidate,
  getGetCandidatesQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import {
  createCandidateSchema,
  candidateStatuses,
  type CreateCandidateInput,
} from './schema';

const fieldClass =
  'w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50';

export function CandidateForm() {
  const queryClient = useQueryClient();
  const createCandidate = useCreateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
      },
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema),
    defaultValues: { status: 'COLD' },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Drop empty optional strings so we don't send "" to nullable API fields.
    const data = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v !== undefined),
    ) as CreateCandidateInput;

    await createCandidate.mutateAsync({ data });
    reset({ status: 'COLD' });
  });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-black/10 p-6 dark:border-white/15"
    >
      <h2 className="text-lg font-semibold">Add candidate</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="displayId" className="text-sm font-medium">
          Display ID
        </label>
        <input
          id="displayId"
          placeholder="CDD-0001"
          className={fieldClass}
          {...register('displayId')}
        />
        {errors.displayId && (
          <p className="text-xs text-red-500">{errors.displayId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-sm font-medium">
          Full name
        </label>
        <input id="fullName" className={fieldClass} {...register('fullName')} />
        {errors.fullName && (
          <p className="text-xs text-red-500">{errors.fullName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          className={fieldClass}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mobile" className="text-sm font-medium">
          Mobile
        </label>
        <input id="mobile" className={fieldClass} {...register('mobile')} />
        {errors.mobile && (
          <p className="text-xs text-red-500">{errors.mobile.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="currentPosition" className="text-sm font-medium">
          Current position
        </label>
        <input
          id="currentPosition"
          className={fieldClass}
          {...register('currentPosition')}
        />
        {errors.currentPosition && (
          <p className="text-xs text-red-500">
            {errors.currentPosition.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select id="status" className={fieldClass} {...register('status')}>
          {candidateStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          className={fieldClass}
          {...register('notes')}
        />
        {errors.notes && (
          <p className="text-xs text-red-500">{errors.notes.message}</p>
        )}
      </div>

      {createCandidate.isError && (
        <p className="text-sm text-red-500">
          {createCandidate.error?.message ?? 'Failed to create'}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isSubmitting ? 'Saving…' : 'Add candidate'}
      </button>
    </form>
  );
}
