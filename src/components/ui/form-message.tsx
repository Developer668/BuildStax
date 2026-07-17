import type { ActionState } from "@/lib/actions/types";

type FieldErrorOptions = {
  describedBy?: string;
  id?: string;
};

function getFieldError(state: ActionState, name: string) {
  return state.fieldErrors?.[name]?.[0];
}

function humanizeFieldError(name: string, error: string) {
  if (name === "pricingFloor" && error.startsWith("Too small:")) {
    return "Enter a pricing floor greater than $0.";
  }
  if (error.startsWith("Too small: expected number")) {
    return "Enter a number greater than the minimum allowed value.";
  }
  if (error.startsWith("Too big: expected number")) {
    return "Enter a number below the maximum allowed value.";
  }
  return error;
}

export function fieldErrorProps(state: ActionState, name: string, options: FieldErrorOptions = {}) {
  const error = getFieldError(state, name);
  const errorId = options.id ?? `${name}-error`;
  const describedBy = [options.describedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return {
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  } as const;
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <div
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "rounded-[5px] border border-[#efc4bd] bg-[#fff3f1] px-3 py-2 text-[12px] font-semibold text-[#9e3a2f]"
          : "rounded-[5px] border border-[#b8dec7] bg-[#edf8f1] px-3 py-2 text-[12px] font-semibold text-[#21683f]"
      }
    >
      {state.message}
    </div>
  );
}

export function FieldError({ state, name, id }: { state: ActionState; name: string; id?: string }) {
  const error = getFieldError(state, name);
  return error ? <p id={id ?? `${name}-error`} className="field-error">{humanizeFieldError(name, error)}</p> : null;
}
