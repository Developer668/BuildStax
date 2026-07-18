import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type TranscriptTurn = {
  role: "caller" | "agent";
  text: string;
};

export type ArchivedCallTranscript = {
  id: string;
  callId: string;
  status: "requested" | "ringing" | "in_progress" | "completed" | "failed" | "cancelled";
  direction: "inbound" | "outbound";
  updatedAt: string;
  durationSeconds: number;
  turns: TranscriptTurn[];
};

const statuses = new Set<ArchivedCallTranscript["status"]>([
  "requested", "ringing", "in_progress", "completed", "failed", "cancelled",
]);

function cleanText(value: unknown, max = 100_000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return fallback.toISOString();
}

export function parseVoiceTranscript(value: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^(Customer|Caller|Agent):\s*(.*)$/i.exec(line);
    if (match) {
      const text = cleanText(match[2], 12_000);
      if (text) turns.push({ role: /agent/i.test(match[1]) ? "agent" : "caller", text });
      continue;
    }
    const previous = turns.at(-1);
    if (previous) previous.text = `${previous.text} ${cleanText(line, 12_000)}`.trim().slice(0, 12_000);
  }
  return turns.slice(0, 1_000);
}

export async function listArchivedCallTranscripts(): Promise<ArchivedCallTranscript[]> {
  if (process.env.NODE_ENV === "production" || process.env.PLIVO_LOCAL_BRIDGE !== "true") return [];

  const directory = path.join(process.cwd(), "data", "voice-bridge");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const records = await Promise.all(entries
    .filter((entry) => entry.isFile() && /^session-[0-9a-f]{64}\.json$/.test(entry.name))
    .slice(0, 1_000)
    .map(async (entry): Promise<ArchivedCallTranscript | null> => {
      try {
        const file = path.join(directory, entry.name);
        const fileStat = await stat(file);
        if (fileStat.size > 150_000) return null;
        const row = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
        const id = cleanText(row.id, 80);
        const callId = cleanText(row.provider_call_id, 160);
        const status = cleanText(row.status, 40) as ArchivedCallTranscript["status"];
        const direction = row.direction === "outbound" ? "outbound" : "inbound";
        if (!/^tel_[0-9a-f-]{36}$/i.test(id) || !statuses.has(status)) return null;
        const durationSeconds = Math.max(0, Math.min(86_400, Math.round(Number(row.duration_seconds) || 0)));
        return {
          id,
          callId,
          status,
          direction,
          updatedAt: safeDate(row.ended_at ?? row.updated_at ?? row.answered_at, fileStat.mtime),
          durationSeconds,
          turns: parseVoiceTranscript(cleanText(row.transcript)),
        };
      } catch {
        return null;
      }
    }));

  return records
    .filter((record): record is ArchivedCallTranscript => Boolean(record))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 250);
}
