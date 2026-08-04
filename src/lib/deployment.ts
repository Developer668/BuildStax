import { z } from "zod";

export const deploymentUrlSchema = z.string().trim().min(1, "Enter the deployed site URL.").max(500).superRefine((value, context) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid deployed site URL." });
    return;
  }
  if (parsed.protocol !== "https:") {
    context.addIssue({ code: "custom", message: "The deployed site URL must use HTTPS." });
  }
  if (parsed.username || parsed.password || parsed.hash) {
    context.addIssue({ code: "custom", message: "The deployed site URL cannot contain credentials or a fragment." });
  }
});

export function isSafeDeploymentUrl(value: string | null | undefined): value is string {
  return Boolean(value && deploymentUrlSchema.safeParse(value).success);
}
