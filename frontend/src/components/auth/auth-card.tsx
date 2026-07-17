import { Logo } from "@/components/brand/logo";

/** Centered card layout shared by login / signup / forgot-password. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-background to-muted/50">
      <div className="mb-7">
        <Logo size={40} />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight mb-1">{title}</h1>
        <p className="text-sm text-muted-foreground mb-5">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
