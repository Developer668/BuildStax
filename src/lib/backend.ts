import { appMode } from "@/lib/utils";

export type DataBackend = "insforge" | "sqlite";

export function dataBackend(): DataBackend {
  const configured = process.env.DATA_BACKEND;
  if (configured === "insforge" || configured === "sqlite") return configured;
  if (process.env.NEXT_PUBLIC_INSFORGE_URL && process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY) return "insforge";
  if (appMode() === "production") {
    throw new Error("DATA_BACKEND=insforge and InsForge public configuration are required in production.");
  }
  return "sqlite";
}

export function isInsForgeBackend() {
  return dataBackend() === "insforge";
}
