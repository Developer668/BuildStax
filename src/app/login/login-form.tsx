"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { loginAction } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage, fieldErrorProps } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ defaultEmail, showLocalCredentials, allowSignUp }: { defaultEmail: string; showLocalCredentials: boolean; allowSignUp: boolean }) {
  const [state, action] = useActionState(loginAction, initialActionState);
  const [showPassword, setShowPassword] = useState(false);
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
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <Input id="email" name="email" type="email" autoComplete="username" defaultValue={defaultEmail} {...fieldErrorProps(state, "email")} />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <div className="relative">
          <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="pr-11" defaultValue={showLocalCredentials ? "buildstax-local" : undefined} {...fieldErrorProps(state, "password")} />
          <Button variant="ghost" size="iconSm" className="absolute right-1 top-1" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        <FieldError state={state} name="password" />
      </div>
      {showLocalCredentials ? <p className="rounded-[5px] border border-[#edd4aa] bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#79501d]">Local sandbox credentials are prefilled. Production mode requires configured credentials.</p> : null}
      <FormMessage state={state} />
      <SubmitButton variant="dark" size="lg" className="w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
      {allowSignUp ? <p className="text-center text-[10px] text-muted-foreground">New operator? <Link href="/signup" className="font-bold text-foreground hover:underline">Create an account</Link></p> : null}
    </form>
  );
}
