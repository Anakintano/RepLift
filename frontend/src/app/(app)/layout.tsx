"use client";

/**
 * Authenticated layout: guards the app routes, redirects to onboarding when
 * the profile is incomplete, starts the sync scheduler, and hydrates the
 * device diary cache.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { useProfile, useUser } from "@/lib/hooks/use-auth";
import { useDiaryHydration } from "@/lib/hooks/use-diary";
import { startSyncScheduler } from "@/lib/sync/outbox";
import { todayIn } from "@/lib/domain/dates";
import { Skeleton } from "@/components/ui/skeleton";

function FullPageSkeleton() {
  return (
    <div className="min-h-dvh p-6 space-y-4" aria-busy="true" aria-label="Loading RepLift">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isPending: userPending } = useUser();
  const { data: profile, isPending: profilePending, isError: profileMissing } = useProfile();

  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  useDiaryHydration(todayIn(tz));

  useEffect(() => {
    startSyncScheduler();
  }, []);

  useEffect(() => {
    if (!userPending && user === null) router.replace("/login");
    else if (user && (profileMissing || (profile && !profile.onboardingCompleted))) router.replace("/onboarding");
  }, [user, userPending, profile, profileMissing, router]);

  if (userPending || (user && profilePending)) return <FullPageSkeleton />;
  if (!user || !profile?.onboardingCompleted) return <FullPageSkeleton />;

  return <AppShell>{children}</AppShell>;
}
