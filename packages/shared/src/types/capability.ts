/**
 * ApplyCapability — shared between API, web, and extension.
 * Mirror of packages/db's APPLY_CAPABILITIES const, lifted to shared so
 * the web app doesn't need to depend on the DB package.
 */

export const APPLY_CAPABILITIES = [
  'tier1_server',          // Greenhouse / Lever / Ashby — server queue + submit
  'tier2_assisted',        // Workday / iCIMS / SmartRecruiters — server fills, user submits
  'extension_universal',   // Custom ATS — extension generic field detection
  'manual_only',           // No supported path — show + tailor resume + open external
] as const;

export type ApplyCapability = (typeof APPLY_CAPABILITIES)[number];

export function deriveCapability(atsType: string | null | undefined): ApplyCapability {
  if (!atsType) return 'manual_only';
  const t = atsType.toLowerCase();
  if (['greenhouse', 'lever', 'ashby'].includes(t)) return 'tier1_server';
  if (['workday', 'icims', 'smartrecruiters', 'jobvite', 'taleo'].includes(t)) return 'tier2_assisted';
  return 'extension_universal';
}
