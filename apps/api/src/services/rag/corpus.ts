/**
 * Hand-written immigration-rule explainers seeded into ml.knowledge_chunks
 * alongside the auto-derived per-company visa stats. Source: USCIS, DOL,
 * NAFSA, current law as of 2026.
 *
 * Each entry becomes one row in ml.knowledge_chunks with kind='immigration_rule'.
 * Keep entries focused (one topic per chunk, ~150-300 words) so retrieval
 * surfaces the right one without dragging in irrelevant context.
 */
export interface ImmigrationChunk {
  slug: string;       // stable id for re-seeding without duplication
  title: string;
  body: string;
}

export const IMMIGRATION_CORPUS: ImmigrationChunk[] = [
  {
    slug: 'h1b-cap-timeline',
    title: 'H-1B annual cap and lottery timeline',
    body: `The H-1B program has an annual numerical cap of 65,000 visas plus an additional 20,000 reserved for candidates with a US master's degree or higher (the "master's cap"). USCIS opens electronic registration each March; employers register candidates and pay a $10 fee per registration. USCIS then conducts a random lottery (typically late March) and notifies selected registrants. Selected candidates' employers may file the full H-1B petition between April 1 and June 30, with an October 1 start date if approved. Demand has exceeded supply every year since 2014, with selection rates falling to roughly 14-25% depending on year. Cap-exempt employers (universities, qualifying nonprofit research orgs, government research) can file petitions year-round without participating in the lottery.`,
  },
  {
    slug: 'f1-opt-stem-extension',
    title: 'F-1 OPT, STEM extension, and the H-1B bridge',
    body: `F-1 students completing a US degree are eligible for 12 months of Optional Practical Training (OPT), which allows employment in their field of study. Students in STEM fields on the DHS-designated list (CIP codes) can apply for a 24-month STEM OPT extension, giving up to 36 months total of work authorization after the degree. STEM OPT requires the employer to be enrolled in E-Verify and to provide a structured training plan (Form I-983). This 36-month window typically gives F-1 graduates up to three H-1B lottery attempts. After STEM OPT ends, the candidate must either be in valid H-1B status (cap-gap protection bridges the April-October window when H-1B is approved), transition to another status (O-1, dependent visa, etc.), or depart the US.`,
  },
  {
    slug: 'cap-exempt-employers',
    title: 'Cap-exempt H-1B employers',
    body: `Certain employers are exempt from the H-1B annual cap and can file petitions year-round: institutions of higher education (universities), nonprofit organizations affiliated with universities, qualifying nonprofit research organizations, and government research organizations. Candidates working for cap-exempt employers do NOT count against the annual cap. Concurrent employment is possible — a cap-exempt H-1B holder can also work for a cap-subject employer at the same time. Many international STEM graduates start at universities or research institutes for this reason while concurrently exploring private-sector opportunities. National-interest waivers and EB-1A/EB-1B/EB-2 NIW green-card pathways also bypass employer dependence but require a separate adjudication.`,
  },
  {
    slug: 'visa-sponsorship-in-jd',
    title: 'How to read visa sponsorship language in a job description',
    body: `Job descriptions communicate visa sponsorship willingness in a few standard ways. Positive signals: "We sponsor H-1B and green cards", "Visa sponsorship available", "Open to applicants requiring sponsorship", or specific mentions of E-3, TN, or O-1. Neutral: "Must be authorized to work in the US" — this means the candidate needs current authorization (F-1 OPT counts) but the employer may not commit to future H-1B sponsorship. Negative: "Must be a US citizen or permanent resident", "Cannot sponsor visas", "ITAR restricted" (defense/aerospace roles typically can't hire non-citizens), or silence combined with the company having zero LCA filings in DOL data. Always cross-check the JD text against the employer's actual H-1B history before applying.`,
  },
  {
    slug: 'prevailing-wage-and-lca',
    title: 'Prevailing wage, LCA, and what they signal about salary',
    body: `Before filing an H-1B petition, employers must obtain a Labor Condition Application (LCA) certified by the DOL. The LCA requires the employer to pay at least the prevailing wage for the SOC code in the specific worksite — the higher of the offered wage or the DOL prevailing wage. Prevailing wages come from BLS OEWS data and are published at four levels (entry / qualified / experienced / fully competent). If an employer's offered wage is significantly above the prevailing wage, that's a positive signal; if it's exactly at the prevailing wage, the employer is paying the legal minimum. SwipeHire's per-employer visa stats show median, p25, and p75 wage_offered values per SOC so candidates can benchmark against historical filings.`,
  },
  {
    slug: 'denial-vs-withdrawal',
    title: 'How to read certification, denial, and withdrawal counts',
    body: `When evaluating an employer's H-1B track record, three counts matter most: certified (LCA approved), denied (USCIS rejected the H-1B petition after LCA certification), and withdrawn (employer pulled the petition before adjudication). A high certification rate (>90%) is the baseline expectation — almost everyone gets LCA-certified. The signal is in denials and withdrawals: high denials suggest the employer's petitions don't survive USCIS RFEs (often because wage level, specialty-occupation justification, or beneficiary qualifications are weak). Withdrawals often indicate the candidate dropped out (offer rescinded, found another opportunity) rather than the employer's fault, but a withdrawal spike can also reflect a layoff or hiring freeze.`,
  },
  {
    slug: 'green-card-pathways',
    title: 'Common employment-based green-card pathways',
    body: `The main employment-based green-card categories: EB-1A (extraordinary ability — self-sponsored, no employer needed), EB-1B (outstanding researcher/professor — requires university or research org), EB-1C (multinational executive/manager), EB-2 PERM (advanced degree, requires labor certification proving no US worker is available), EB-2 NIW (national interest waiver — self-sponsored, no employer needed), EB-3 (skilled workers, also requires PERM). For most H-1B holders, the path is EB-2 or EB-3 PERM with their employer. Backlog times vary dramatically by country of birth: most countries clear in 1-2 years, but India-born applicants in EB-2/EB-3 currently face decades-long waits due to per-country annual caps. EB-1A and EB-2 NIW bypass employer dependence and have shorter backlogs.`,
  },
];

/**
 * Render an employer-visa-stats row into a paragraph chunk that can be
 * embedded and retrieved. Includes only fields that materially matter for
 * a candidate evaluating whether to apply.
 */
export function statsRowToChunk(row: {
  fein: string;
  employer_name: string;
  soc_code: string | null;
  total_lcas_24mo: number;
  certified_count: number;
  denied_count: number;
  withdrawn_count: number;
  median_wage_offered: string | null;
  p25_wage_offered: string | null;
  p75_wage_offered: string | null;
  last_sponsored_at: string | null;
  job_titles_sample?: string[] | null;
}): { title: string; body: string; sourceId: string; metadata: any } {
  const socLabel = row.soc_code ? ` for SOC ${row.soc_code}` : ' (all roles)';
  const total = row.total_lcas_24mo ?? 0;
  const certRate = total > 0 ? Math.round((100 * row.certified_count) / total) : null;
  const denyRate = total > 0 ? Math.round((100 * row.denied_count) / total) : null;
  const wdrawRate = total > 0 ? Math.round((100 * row.withdrawn_count) / total) : null;
  const wages: string[] = [];
  if (row.p25_wage_offered) wages.push(`p25 $${Number(row.p25_wage_offered).toLocaleString()}`);
  if (row.median_wage_offered) wages.push(`median $${Number(row.median_wage_offered).toLocaleString()}`);
  if (row.p75_wage_offered) wages.push(`p75 $${Number(row.p75_wage_offered).toLocaleString()}`);
  const last = row.last_sponsored_at ? `Last sponsored: ${new Date(row.last_sponsored_at).toLocaleDateString()}.` : '';
  const sampleTitles = row.job_titles_sample?.length
    ? `Sample roles sponsored: ${row.job_titles_sample.slice(0, 5).join('; ')}.`
    : '';

  const body = [
    `${row.employer_name}${socLabel}: ${total} LCA filings in the last 24 months.`,
    certRate !== null ? `Certification rate ${certRate}%; denial rate ${denyRate}%; withdrawal rate ${wdrawRate}%.` : '',
    wages.length ? `Wage offers — ${wages.join(', ')}.` : '',
    last,
    sampleTitles,
  ].filter(Boolean).join(' ');

  return {
    title: `${row.employer_name}${row.soc_code ? ` — ${row.soc_code}` : ''} visa history`,
    body,
    sourceId: `${row.fein}|${row.soc_code ?? ''}`,
    metadata: {
      fein: row.fein,
      company: row.employer_name,
      soc: row.soc_code,
      totalLcas24mo: total,
      certificationRate: certRate,
      denialRate: denyRate,
      withdrawalRate: wdrawRate,
    },
  };
}
