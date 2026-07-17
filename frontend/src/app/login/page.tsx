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
import { useLogin } from "@/lib/hooks/use-auth";
import { isApiError, errorMessage } from "@/lib/api/problem";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/api/mock/seed/demo";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const err = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    login.mutate(values, { onSuccess: () => router.push("/dashboard") });
  });

  return (
    <AuthCard title="Welcome back" subtitle="Log in to keep your streak going.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="li-email">Email</Label>
          <Input id="li-email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} aria-invalid={!!err.email} />
          {err.email && <p className="text-xs text-destructive">{err.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="li-password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="li-password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={!!err.password} />
          {err.password && <p className="text-xs text-destructive">{err.password.message}</p>}
        </div>

        {login.isError && (
          <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2" role="alert">
            {isApiError(login.error) ? login.error.problem.detail : errorMessage(login.error)}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <div className="mt-4 rounded-lg bg-muted/70 px-3 py-2.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-0.5">Demo account</p>
        <p className="tnum">
          {DEMO_EMAIL} · {DEMO_PASSWORD}
        </p>
      </div>

      <p className="text-sm text-muted-foreground mt-5 text-center">
        New here?{" "}
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
