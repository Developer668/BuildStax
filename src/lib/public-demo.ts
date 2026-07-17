export const BUILDSTAX_DEMO_PHONE = "+13307377690";

export function resolveBuildStaxDemoPhone(configured: string | undefined) {
  const value = configured?.trim() ?? "";
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : BUILDSTAX_DEMO_PHONE;
}
