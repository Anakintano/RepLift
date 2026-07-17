"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/lib/hooks/use-auth";
import { isApiError, errorMessage } from "@/lib/api/problem";

const schema = z
  .object({
    displayName: z.string().min(2, "Tell us what to call you"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const register = useRegister();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", password: "", confirm: "" },
  });
  const err = form.formState.errors;

  const submit = form.handleSubmit((v) => {
    register.mutate(
      { displayName: v.displayName, email: v.email, password: v.password },
      { onSuccess: () => router.push("/onboarding") },
    );
  });

  const serverFieldError = isApiError(register.error) ? register.error.fieldErrors.email : undefined;

  return (
    <AuthCard title="Create your account" subtitle="Two minutes to set up — free while in beta.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="su-name">Name</Label>
          <Input id="su-name" autoComplete="name" placeholder="Alex" {...form.register("displayName")} aria-invalid={!!err.displayName} />
          {err.displayName && <p className="text-xs text-destructive">{err.displayName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-email">Email</Label>
          <Input id="su-email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} aria-invalid={!!err.email || !!serverFieldError} />
          {(err.email || serverFieldError) && <p className="text-xs text-destructive">{err.email?.message ?? serverFieldError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-password">Password</Label>
          <Input id="su-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!err.password} />
          <p className="text-xs text-muted-foreground">8+ characters. A passphrase works great.</p>
          {err.password && <p className="text-xs text-destructive">{err.password.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-confirm">Confirm password</Label>
          <Input id="su-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} aria-invalid={!!err.confirm} />
          {err.confirm && <p className="text-xs text-destructive">{err.confirm.message}</p>}
        </div>

        {register.isError && !serverFieldError && (
          <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2" role="alert">
            {errorMessage(register.error)}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground mt-5 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
