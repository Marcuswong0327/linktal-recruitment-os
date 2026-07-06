'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createCandidateSchema, candidateStatuses, type CreateCandidateInput } from './schema';
import { useCreateCandidate } from './hooks';

const fieldClass =
  'w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50';

export function CandidateForm() {
  const createCandidate = useCreateCandidate();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema),
    defaultValues: { status: 'APPLIED' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await createCandidate.mutateAsync(values);
    reset({ status: 'APPLIED' });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-lg font-semibold">Add candidate</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input id="name" className={fieldClass} {...register('name')} />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input id="email" type="email" className={fieldClass} {...register('email')} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-sm font-medium">
          Role
        </label>
        <input id="role" className={fieldClass} {...register('role')} />
        {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
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
        <textarea id="notes" rows={3} className={fieldClass} {...register('notes')} />
        {errors.notes && <p className="text-xs text-red-500">{errors.notes.message}</p>}
      </div>

      {createCandidate.isError && (
        <p className="text-sm text-red-500">{createCandidate.error.message}</p>
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
