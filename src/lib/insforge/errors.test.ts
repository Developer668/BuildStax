import { describe, expect, it } from "vitest";
import { isExistingAccountError, safeInsForgeMessage } from "./errors";

describe("InsForge auth errors", () => {
  it("recognizes the existing-user conflict returned by signup", () => {
    expect(isExistingAccountError({ message: "User already exists" })).toBe(true);
    expect(isExistingAccountError({ message: "Invalid email" })).toBe(false);
  });

  it("does not expose unrecognized backend errors", () => {
    expect(safeInsForgeMessage({ message: "internal database detail" }, "Try again.")).toBe("Try again.");
  });
});
