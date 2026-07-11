import { CandidateForm } from '@/features/candidates/candidate-form';
import { CandidateList } from '@/features/candidates/candidate-list';
import { AuthGate } from '@/features/auth/auth-gate';

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Linktal Recruitment OS</h1>
        <p className="text-sm opacity-70">
          Next.js + Tailwind + React Query on the front, NestJS + Prisma + Neon on the back.
        </p>
      </header>

      <AuthGate>
        <section className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <CandidateForm />
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Candidates</h2>
            <CandidateList />
          </div>
        </section>
      </AuthGate>
    </main>
  );
}
