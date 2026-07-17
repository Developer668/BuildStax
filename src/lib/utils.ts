import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function appMode() {
  const configured = process.env.APP_MODE;
  if (configured === "production" || configured === "sandbox") return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_MODE must be explicitly set to production or sandbox.");
  }
  return "sandbox";
}

export function isSandbox() {
  return appMode() === "sandbox";
}
