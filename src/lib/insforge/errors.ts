function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return "message" in error && typeof error.message === "string" ? error.message : "";
}

export function isExistingAccountError(error: unknown) {
  return /user already exists|already registered|email already (?:exists|in use)/i.test(errorMessage(error));
}

export function safeInsForgeMessage(error: unknown, fallback: string) {
  const message = errorMessage(error);
  if (/rate|too many/i.test(message)) return "Too many requests. Wait a moment and try again.";
  if (/daily spend cap/i.test(message)) return "This campaign's daily automation spend cap has been reached.";
  if (/quote expired|after the quote expired/i.test(message)) return "This quote has expired. Create a new quote before collecting payment.";
  if (/do-not-call|outreach is blocked/i.test(message)) return "Outreach is permanently blocked for this business.";
  if (/not found/i.test(message)) return "The requested record was not found.";
  if (/permission|policy|row-level|unauthor/i.test(message)) return "You do not have permission to perform this operation.";
  if (/duplicate|unique/i.test(message)) return "That record already exists.";
  return fallback;
}
