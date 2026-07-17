"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/problem";
import { toast } from "sonner";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const submit = form.handleSubmit(async ({ email }) => {
    try {
      await (await getClient()).auth.requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a reset link.">
      {sent ? (
        <div className="text-center py-4" role="status">
          <MailCheck className="size-10 mx-auto text-success mb-3" aria-hidden />
          <p className="font-medium mb-1">Check your inbox</p>
          <p className="text-sm text-muted-foreground mb-5">
            If an account exists for that email, a reset link is on its way.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to log in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="fp-email">Email</Label>
            <Input id="fp-email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            <Link href="/login" className="text-primary font-medium hover:underline">
              Back to log in
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
