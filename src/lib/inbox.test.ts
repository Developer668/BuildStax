import { describe, expect, it } from "vitest";
import type { Business, Message } from "@/lib/db/schema";
import { buildInboxThreads } from "@/lib/inbox";

const business = (id: string, name: string) => ({ id, name, category: "Local service", location: "Oakland", email: "owner@example.test" } as Business);
const message = (id: string, businessId: string, direction: Message["direction"], createdAt: string, subject = "") => ({
  id,
  businessId,
  direction,
  channel: "email",
  status: direction === "inbound" ? "received" : "sent",
  subject,
  body: `${subject} body`,
  provider: "Test provider",
  createdAt,
} as Message);

describe("inbox thread grouping", () => {
  it("groups messages by business and uses the newest message for response state", () => {
    const rows = buildInboxThreads([
      { business: business("biz_a", "Aster Studio"), message: message("msg_old", "biz_a", "outbound", "2026-08-01T10:00:00.000Z", "Proposal") },
      { business: business("biz_a", "Aster Studio"), message: message("msg_new", "biz_a", "inbound", "2026-08-02T10:00:00.000Z", "Question") },
      { business: business("biz_b", "Birch Cafe"), message: message("msg_b", "biz_b", "outbound", "2026-08-03T10:00:00.000Z", "Follow-up") },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ business: { id: "biz_b" }, needsResponse: false });
    expect(rows[1]).toMatchObject({ business: { id: "biz_a" }, needsResponse: true, lastMessage: { id: "msg_new" } });
    expect(rows[1].messages).toHaveLength(2);
  });

  it("filters complete threads by response state and searchable message content", () => {
    const rows = [
      { business: business("biz_a", "Aster Studio"), message: message("msg_a", "biz_a", "inbound", "2026-08-02T10:00:00.000Z", "Need a booking link") },
      { business: business("biz_b", "Birch Cafe"), message: message("msg_b", "biz_b", "outbound", "2026-08-03T10:00:00.000Z", "Menu update") },
    ];

    expect(buildInboxThreads(rows, { view: "needs_response" }).map((thread) => thread.business.id)).toEqual(["biz_a"]);
    expect(buildInboxThreads(rows, { view: "waiting" }).map((thread) => thread.business.id)).toEqual(["biz_b"]);
    expect(buildInboxThreads(rows, { search: "booking" }).map((thread) => thread.business.id)).toEqual(["biz_a"]);
  });
});
