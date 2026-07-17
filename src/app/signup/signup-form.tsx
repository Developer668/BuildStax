"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { signUpAction } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/types";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function SignupForm() {
  const [state, action] = useActionState(signUpAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      toast.success(state.message);
      router.replace(state.redirectTo);
    }
  }, [router, state]);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div><label htmlFor="name" className="field-label">Name</label><Input id="name" name="name" autoComplete="name" {...fieldErrorProps(state, "name")} /><FieldError state={state} name="name" /></div>
      <div><label htmlFor="email" className="field-label">Email</label><Input id="email" name="email" type="email" autoComplete="email" {...fieldErrorProps(state, "email")} /><FieldError state={state} name="email" /></div>
      <div><label htmlFor="password" className="field-label">Password</label><Input id="password" name="password" type="password" autoComplete="new-password" {...fieldErrorProps(state, "password", { describedBy: "password-hint" })} /><p id="password-hint" className="field-hint">Use at least 10 characters.</p><FieldError state={state} name="password" /></div>
      <FormMessage state={state} />
      <SubmitButton variant="dark" size="lg" className="w-full" pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-center text-[10px] text-muted-foreground">Already registered? <Link href="/login" className="font-bold text-foreground hover:underline">Sign in</Link></p>
    </form>
  );
}
