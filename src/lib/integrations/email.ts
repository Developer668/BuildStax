import "server-only";

import { z } from "zod";
import { runJsonCapability } from "@/lib/providers/zero";

const emailSchema = z.object({
  to: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(1).max(180),
  text: z.string().trim().min(1).max(8_000),
  replyTo: z.string().trim().toLowerCase().email().optional(),
});

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function htmlFromText(value: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.55;color:#172018;white-space:pre-wrap">${escapeHtml(value)}</div>`;
}

export async function deliverTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
}) {
  const replyTo = process.env.BUILDSTAX_REPLY_TO?.trim();
  const parsed = emailSchema.safeParse({ ...input, ...(replyTo ? { replyTo } : {}) });
  if (!parsed.success) throw new Error("The follow-up email has an invalid recipient, subject, or body.");

  const result = await runJsonCapability({
    intent: "transactional_email",
    body: {
      to: [parsed.data.to],
      subject: parsed.data.subject,
      text: parsed.data.text,
      html: htmlFromText(parsed.data.text),
      ...(parsed.data.replyTo ? { replyTo: parsed.data.replyTo } : {}),
    },
  });

  return {
    provider: result.provider,
    runId: result.runId,
    costCents: result.costCents,
  };
}

export function safeEmailProviderMessage(error: unknown) {
  if (!(error instanceof Error)) return "The email provider could not send the follow-up.";
  if (/Live Zero actions are disabled|authenticated identity|insufficient|402|balance/i.test(error.message)) {
    return "Email delivery is unavailable until the authenticated Zero account has a funded, enabled live-action session.";
  }
  if (/invalid recipient|invalid.*email/i.test(error.message)) return "The business needs a valid email address before a follow-up can be sent.";
  return "The email provider could not send the follow-up. No delivery was recorded.";
}
