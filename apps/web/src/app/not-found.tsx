import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/50 px-6 text-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
        L
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have been moved.
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants()}>
        Back to dashboard
      </Link>
    </main>
  );
}
