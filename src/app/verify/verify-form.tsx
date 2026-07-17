"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { verifyEmailAction } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/types";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyForm({ email }: { email: string }) {
  const [state, action] = useActionState(verifyEmailAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      toast.success(state.message);
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div><label htmlFor="email" className="field-label">Email</label><Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} {...fieldErrorProps(state, "email")} /><FieldError state={state} name="email" /></div>
      <div><label htmlFor="otp" className="field-label">Verification code</label><Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="mono text-[18px]" {...fieldErrorProps(state, "otp")} /><FieldError state={state} name="otp" /></div>
      <FormMessage state={state} />
      <SubmitButton variant="dark" size="lg" className="w-full" pendingLabel="Verifying…">Verify email</SubmitButton>
    </form>
  );
}
