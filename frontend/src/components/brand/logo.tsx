import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// next/image doesn't auto-prepend basePath onto `src` (see basePath docs) — do it ourselves
// so the static-export GitHub Pages build (basePath: "/RepLift") resolves the asset correctly.
const BASE_PATH = process.env.STATIC_EXPORT === "1" ? "/RepLift" : "";

/** Brand lockup. The PNG mark is white-on-black; we mask it into a rounded tile. */
export function Logo({ size = 32, withWordmark = true, href = "/", className }: { size?: number; withWordmark?: boolean; href?: string | null; className?: string }) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 dark:bg-slate-900 ring-1 ring-border overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <Image src={`${BASE_PATH}/logo-192.png`} alt="" width={size} height={size} className="scale-125" priority />
      </span>
      {withWordmark && (
        <span className="font-bold tracking-tight text-foreground" style={{ fontSize: size * 0.62 }}>
          Rep<span className="text-primary">Lift</span>
        </span>
      )}
    </span>
  );
  if (href === null) return mark;
  return (
    <Link href={href} aria-label="RepLift home" className="focus-visible:outline-2 focus-visible:outline-ring rounded-lg">
      {mark}
    </Link>
  );
}
