import { BadgeCheck, Users, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/api/types";

/** Data-provenance badge: where this food's nutrition numbers come from. */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified")
    return (
      <Badge variant="secondary" className="gap-1 text-success">
        <BadgeCheck className="size-3" aria-hidden /> Verified
      </Badge>
    );
  if (status === "community")
    return (
      <Badge variant="secondary" className="gap-1">
        <Users className="size-3" aria-hidden /> Community
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleHelp className="size-3" aria-hidden /> Unverified
    </Badge>
  );
}
