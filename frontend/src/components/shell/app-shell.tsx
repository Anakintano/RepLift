"use client";

/**
 * Authenticated app shell: fixed sidebar ≥ md, bottom tab bar < md,
 * sticky glass header with date-aware title, sync indicator, theme toggle,
 * and user menu. Children render into a max-width container.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Dumbbell,
  TrendingUp,
  UtensilsCrossed,
  FileBarChart,
  Settings,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Logo } from "@/components/brand/logo";
import { SyncIndicator } from "@/components/sync/sync-indicator";
import { ConflictDialog } from "@/components/sync/conflict-dialog";
import { DevToolbar } from "@/components/dev/dev-toolbar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useUser } from "@/lib/hooks/use-auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/diary", label: "Diary", icon: BookOpen },
  { href: "/foods", label: "Foods", icon: UtensilsCrossed },
  { href: "/exercise", label: "Exercise", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/reports", label: "Reports", icon: FileBarChart },
] as const;

/** Bottom bar shows the 5 primary destinations (nav limit rule). */
const MOBILE_NAV = NAV.slice(0, 5);

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4.5 dark:hidden" aria-hidden />
      <Moon className="size-4.5 hidden dark:block" aria-hidden />
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useUser();
  const logout = useLogout();

  const initials = (user?.displayName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh w-full">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar sticky top-0 h-dvh">
        <div className="p-5">
          <Logo size={34} href="/dashboard" />
        </div>
        <nav className="flex-1 px-3 space-y-1" aria-label="Main navigation">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Settings className="size-4.5" aria-hidden />
            Settings
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="glass sticky top-0 z-40 flex h-14 items-center gap-2 px-4 md:px-6">
          <div className="md:hidden">
            <Logo size={28} withWordmark={false} href="/dashboard" />
          </div>
          <div className="flex-1" />
          <SyncIndicator />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Account menu" className="rounded-full focus-visible:outline-2 focus-visible:outline-ring">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <p className="font-semibold">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="size-4" aria-hidden /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout.mutate()} variant="destructive">
                <LogOut className="size-4" aria-hidden /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Main — keyed on route so navigation gets the entrance animation */}
        <main key={pathname} className="page-in flex-1 px-4 md:px-6 py-5 pb-24 md:pb-8 w-full max-w-6xl mx-auto">
          {children}
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]"
        aria-label="Main navigation"
      >
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 pt-2 pb-1.5 text-[11px] font-medium min-w-14 transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <ConflictDialog />
      <DevToolbar />
    </div>
  );
}
