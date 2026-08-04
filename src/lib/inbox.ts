import type { Business, Message } from "@/lib/db/schema";

export type InboxView = "all" | "needs_response" | "waiting";

export type InboxThread = {
  business: Business;
  messages: Message[];
  lastMessage: Message;
  needsResponse: boolean;
};

type InboxEntry = { business: Business; message: Message };

function messageTime(message: Message) {
  const value = new Date(message.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function buildInboxThreads(entries: InboxEntry[], filters: { search?: string; view?: InboxView } = {}) {
  const grouped = new Map<string, { business: Business; messages: Message[] }>();
  for (const entry of entries) {
    if (!(["email", "preview"] as string[]).includes(entry.message.channel)) continue;
    const existing = grouped.get(entry.business.id);
    if (existing) {
      existing.messages.push(entry.message);
    } else {
      grouped.set(entry.business.id, { business: entry.business, messages: [entry.message] });
    }
  }

  const search = filters.search?.trim().toLocaleLowerCase();
  const view = filters.view ?? "all";
  return Array.from(grouped.values())
    .map(({ business, messages }) => {
      const orderedMessages = [...messages].sort((left, right) => messageTime(right) - messageTime(left));
      const lastMessage = orderedMessages[0];
      return {
        business,
        messages: orderedMessages,
        lastMessage,
        needsResponse: lastMessage.direction === "inbound",
      } satisfies InboxThread;
    })
    .filter((thread) => {
      if (search) {
        const businessText = [thread.business.name, thread.business.category, thread.business.location].join(" ").toLocaleLowerCase();
        const messageText = thread.messages.map((message) => [message.subject, message.body, message.provider].join(" ")).join(" ").toLocaleLowerCase();
        if (!businessText.includes(search) && !messageText.includes(search)) return false;
      }
      if (view === "needs_response") return thread.needsResponse;
      if (view === "waiting") return !thread.needsResponse;
      return true;
    })
    .sort((left, right) => messageTime(right.lastMessage) - messageTime(left.lastMessage));
}
