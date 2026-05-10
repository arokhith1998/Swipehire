# SwipeHire Algorithm v2 — Technical Specification

**Author:** Adhithya + Claude
**Date:** May 2026
**Status:** Design spec, ready for implementation
**Supersedes:** SwipeHire Algorithm.pdf (June 2025) and `server/services/jobMatcher.ts` v1

---

## Why v2

The v1 algorithm in `jobMatcher.ts` is a substring-matching weighted sum (50% skills / 30% title / 20% location). It produces a 0–100 score with no calibration, no confidence interval, no semantic understanding, and no learning loop. The v1 H1B service in `h1bVisaService.ts` is a hardcoded table of ~20 big-tech employers with stale FY2023 data.

Those choices are reasonable for an MVP but they are exactly the patterns that have made Jobright's match scores untrustworthy in the eyes of users. v2 fixes this with five structural changes:

1. **Semantic matching** instead of substring matching (skill, title, and JD-evidence).
2. **Calibrated probability output** instead of a raw weighted sum — the score becomes "predicted probability of getting an interview" with a confidence interval.
3. **Real visa intelligence** ingested from public DOL OFLC LCA data (~4.8M records since 2013) and USCIS H-1B Employer Data Hub, with per-SOC, per-FEIN breakdowns and freshness timestamps.
4. **Recruiter-calibrated weighting** — once the recruiter side has thumbs-up/down data, the global weights are learned per role family, not hardcoded.
5. **Fairness and honesty controls** — confidence intervals, decline-to-score below a data threshold, and no inflation of weak signals.

Everything below is designed to be implementable on the existing Node/Express + Postgres + Drizzle stack with the addition of a Python sidecar for ML serving and a vector index. No rewrite of the v1 codebase is required — the new scorer wraps the existing job objects and returns enriched output.

---

## 1. Output contract

Every job-candidate pair produces a single `MatchResult` object. This is the only thing the UI and recruiter dashboard consume.

```ts
type MatchResult = {
  // Overall calibrated probability that this user gets an interview if they apply
  // 0.00 – 1.00, where 0.50 is "industry baseline"
  interviewProbability: number;

  // 90% confidence interval on the above (epistemic — narrows as we collect outcome data)
  confidenceInterval: [number, number];

  // Human-facing label: "Strong fit", "Promising fit", "Stretch", "Weak fit", "Insufficient data"
  // Derived from interviewProbability + confidence width
  label: MatchLabel;

  // Decomposed sub-scores, all 0-1, all calibrated independently
  subscores: {
    skillsSemantic:    Subscore;  // semantic similarity, JD-required ↔ resume-evidence
    titleAlignment:    Subscore;  // role-family match
    seniorityFit:      Subscore;  // years/level alignment
    locationFit:       Subscore;  // geo + remote/hybrid policy
    domainExperience:  Subscore;  // industry/vertical match
    visaCompatibility: Subscore;  // candidate visa needs vs job sponsorship reality
    salaryFit:         Subscore;  // expected vs offered band
    recencySignal:     Subscore;  // posting freshness and recruiter activity
  };

  // Authenticity layer — independent of "fit"
  jobAuthenticity: {
    livenessProbability: number;       // 0-1, "is this job actually live?"
    ghostJobRisk: 'low'|'medium'|'high';
    signalsObserved: string[];          // human-readable, e.g. ["recruiter active 18h ago", "12 applicants in last 7d"]
    lastVerifiedAt: string;             // ISO timestamp
  };

  // Visa intelligence layer (only populated if user has visaStatus that needs sponsorship)
  visaIntel?: VisaIntel;

  // Provenance — every consumer can trust the score because they can see why
  explain: {
    topReasonsToApply: string[];        // 1-3 human-readable
    topReasonsToHesitate: string[];     // 0-3 human-readable
    missingEvidence: string[];          // JD requirements with no matching evidence in resume
    modelVersion: string;
    scoredAt: string;
  };
};

type Subscore = {
  value: number;            // 0-1
  weight: number;            // contribution weight to overall, sums to 1 across subscores
  confidence: number;        // 0-1, lower = less data to make this judgment
  evidence?: string[];       // optional: snippets supporting this subscore
};

type MatchLabel =
  | 'Strong fit'        // p ≥ 0.70 AND CI width ≤ 0.20
  | 'Promising fit'     // p ≥ 0.55 AND CI width ≤ 0.30
  | 'Stretch'           // p ≥ 0.35 OR CI overlaps the threshold
  | 'Weak fit'          // p <  0.35 with reasonable CI
  | 'Insufficient data' // CI width > 0.40 — show but don't claim
```

The `interviewProbability` is the single number we calibrate against ground truth. Everything else is for explanation and UI. **Crucially, the displayed label is derived from probability AND confidence width** — a 0.80 score with a [0.40, 0.95] CI is "Insufficient data," not "Strong fit." This is the structural anti-inflation guarantee.

---

## 2. The scoring pipeline

```
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ User Profile +     │───▶│ Feature Extraction │───▶│ Subscore Models    │
│ Job Posting        │    │ (semantic + struct)│    │ (8 modules)        │
└────────────────────┘    └────────────────────┘    └─────────┬──────────┘
                                                              │
                                                              ▼
                          ┌────────────────────┐    ┌────────────────────┐
                          │ Calibrated         │◀───│ Weighted Combiner  │
                          │ Probability + CI   │    │ (role-family       │
                          │ (Isotonic / Beta)  │    │  conditional)      │
                          └────────┬───────────┘    └────────────────────┘
                                   │
                                   ▼
                          ┌────────────────────┐    ┌────────────────────┐
                          │ Authenticity Layer │───▶│ MatchResult        │
                          │ (liveness, ghost)  │    │                    │
                          └────────────────────┘    └────────────────────┘
                                   ▲
                                   │
                          ┌────────────────────┐
                          │ Visa Intel Layer   │
                          │ (DOL/USCIS data)   │
                          └────────────────────┘
```

Each subscore is computed independently. The combiner produces a raw score. The calibrator turns the raw score into a probability. The authenticity and visa layers are added without modifying the core probability.

---

## 3. Feature extraction

### 3.1 Skill features

The v1 `skill.includes(req)` check fails on every variant ("Python" vs "Python 3.11", "ML" vs "Machine Learning", "Postgres" vs "PostgreSQL"). v2 uses a three-stage approach:

**Stage 1 — Skill normalization.** Build a curated taxonomy of ~5,000 canonical skills with aliases. Source: ESCO (European Skills/Competences/Occupations) public dataset + LinkedIn skill graph (public exports) + manual curation for visa/regulated skills. Map every skill string (from resume and JD) to its canonical form.

**Stage 2 — Embedding similarity.** For unmapped or compound skills, compute embeddings using `text-embedding-3-small` (OpenAI) or `bge-large-en-v1.5` (open-source, self-hostable, 1024-dim, free). Store one vector per skill in a pgvector index. Match resume skills to JD requirements via cosine similarity with a tunable threshold (start at 0.78).

**Stage 3 — JD evidence matching.** For each JD requirement (a sentence like "5+ years building distributed systems in Go"), extract: (a) the canonical skill, (b) the years modifier, (c) the context. Then search the resume for evidence: a bullet that mentions the canonical skill within a context that matches the JD's context. This is the foundation for the resume tailoring evidence-grounding.

Output of skill features:

```ts
type SkillFeatures = {
  matched: Array<{
    jdRequirement: string;         // raw JD text
    canonicalSkill: string;
    resumeEvidence: string | null; // resume bullet, or null if no evidence
    similarity: number;            // 0-1
    yearsRequired: number | null;
    yearsEvidenced: number | null;
  }>;
  unmatched: Array<{
    jdRequirement: string;
    canonicalSkill: string;
    yearsRequired: number | null;
  }>;
  extras: string[];                // canonical skills in resume not asked for in JD
};
```

The `unmatched` array directly feeds the `missingEvidence` field in MatchResult and is what the resume tailoring layer will try to address.

### 3.2 Title features

Replace v1's word-overlap with a **role-family classifier**. Maintain a graph of ~300 role families (Software Engineer, Data Scientist, ML Engineer, Product Manager, ...) with parent-child relationships (Senior SWE is a child of SWE) and synonym sets ("SDE", "Software Developer", "SWE" → Software Engineer).

For a target title and a job title:
- Map both to role families.
- Score = 1.0 if same family, 0.7 if sibling family (e.g., Backend Engineer ↔ Full-Stack Engineer), 0.4 if related (Software Engineer ↔ DevOps Engineer), 0.1 if unrelated.
- Adjust by seniority distance: -0.1 per level mismatch.

This solves the "Frontend Engineer" job appearing as "20% match" for "Software Engineer" target — they should be ~0.7 not 0.2.

### 3.3 Seniority features

Extract seniority from JD using a small classifier trained on title + description: levels are `intern, entry, junior, mid, senior, staff, principal, distinguished, director`. Cross-reference with required-years language.

Compute seniority distance:
- Same level → 1.0
- ±1 level → 0.7
- ±2 levels → 0.3
- ≥3 levels → 0.0

Underqualified candidates are penalized harder than overqualified (asymmetric: a senior applying to a mid role gets 0.6, a mid applying to a senior gets 0.4).

### 3.4 Location features

Replace v1's substring match with a **geo-aware** check:

- Geocode user's preferred locations and the job location to lat/long + metro area + country.
- Same metro → 1.0
- Different metro, same state → 0.6
- Same country, different state → 0.3
- Different country → 0.05 (unless user explicitly opted in to international)
- Remote-allowed AND user remote-OK → 1.0 regardless of geo
- Hybrid AND user hybrid-OK AND in commutable distance → 0.85

Use the OpenStreetMap Nominatim public API for geocoding (free, no API key, rate-limited). Cache aggressively.

### 3.5 Domain experience

Extract industry/vertical from the JD (fintech, healthcare, B2B SaaS, etc.) using a classifier trained on JD text. Match against resume's prior employers (which have known industry tags from a Crunchbase-derived dataset). 1.0 if direct match, 0.5 if adjacent vertical, 0.0 if not present.

This is the "they want fintech experience and you have it" signal that no v1 code currently captures.

### 3.6 Visa compatibility

A composite of:
- Does the user need sponsorship? (from `users.visaStatus`)
- Does the job sponsor? (from `jobs.sponsorsVisa`, validated by visa intel layer)
- For this employer, what is the H1B/EB-2/etc. approval rate in this SOC code?
- What is the freshness of the sponsorship signal? (sponsored someone in the last 12 months in this SOC?)

Detail in §5.

### 3.7 Salary fit

If `users.expectedSalary` is set and `jobs.salaryMin/Max` are present:
- Within range → 1.0
- Within ±15% → 0.75
- Within ±30% → 0.4
- Outside → 0.1

If salary data is missing on either side, set `confidence: 0.0` for this subscore (don't punish the candidate for missing data).

### 3.8 Recency signal

A function of:
- `daysSincePosted` (from `jobs.createdAt` or scraped posting date)
- `applicationVolume` (if observable from source)
- `recruiterActivity` (last seen on LinkedIn, last commit on Greenhouse, etc. — Phase 2)

Score = `exp(-daysSincePosted / 14)` × `(1 - min(applicationVolume/200, 1.0))`

Jobs older than 30 days are heavily penalized (this kills a chunk of ghosts mechanically).

---

## 4. Calibration: turning raw scores into honest probabilities

This is the part Jobright skipped and is the single most important differentiator.

### 4.1 The combiner

A weighted sum is fine for the **raw score**:

```
raw = Σ subscores[i].value × weights[i]
```

But the weights are not the v1 hardcoded `0.5/0.3/0.2`. They are learned per role family:

```ts
// Example learned weights for "Software Engineer" role family
{
  skillsSemantic:   0.32,
  titleAlignment:   0.18,
  seniorityFit:     0.13,
  locationFit:      0.10,
  domainExperience: 0.08,
  visaCompatibility:0.10,  // higher for international users
  salaryFit:        0.05,
  recencySignal:    0.04
}
```

Initial weights come from a **logistic regression on a labeled dataset** of (resume, JD, outcome) tuples. We bootstrap this with:
- Public dataset: Kaggle's "Resume / Job Description Matching" datasets (label = HR judged fit)
- Synthetic: GPT-generated (resume, JD, outcome) tuples with self-consistency checks
- After Phase 3 launch: real recruiter thumbs-up/down data + interview-scheduled outcomes

Different role families learn different weights. Title alignment matters more for "Engineering Manager" than for "Junior Software Engineer."

### 4.2 The calibrator

Take the raw score from the combiner. Map it to a calibrated probability via **isotonic regression** (sklearn's `IsotonicRegression` or its TS port). Isotonic is the right choice because:
- It's monotonic (higher raw → higher probability, always)
- It doesn't assume a parametric form
- It corrects for the fact that "75% raw" might empirically mean "30% interview probability"

Train the isotonic on (raw_score, did_interview_happen) pairs. Bootstrap with the same bootstrap dataset; refit nightly once we have ≥10k real outcomes.

### 4.3 The confidence interval

Use **bootstrap resampling** on the calibration model: resample the calibration training data 200 times, refit the isotonic, get 200 predicted probabilities for each query, take the 5th and 95th percentiles. Width of the CI shrinks as we get more outcome data — this is exactly the property we want for the "Insufficient data" label to disappear over time.

For features with low confidence (e.g., missing salary data, missing visa data), inflate the CI by adding noise proportional to the missingness.

### 4.4 Anti-inflation guarantees

Three structural rules enforce honesty:

1. **Decline to score below threshold.** If the average subscore confidence < 0.4, output `label: 'Insufficient data'` and don't show the headline number. We have to earn the right to claim a score.

2. **Display CI width visibly.** UI shows "Strong fit (p ≈ 0.74, ±0.08)" for a tight estimate and "Promising (p ≈ 0.62, ±0.18)" for a loose one. Users learn what tight vs loose means within a session.

3. **Calibration audit on the Honesty Dashboard.** Public weekly chart: "Of jobs we labeled 70%+ probability, what % actually led to interviews?" If the calibration drifts, we recalibrate. Public visibility is the forcing function.

---

## 5. Visa intelligence layer

### 5.1 Data sources

**Primary:** DOL OFLC public LCA disclosure data. Quarterly XLSX/CSV files at `https://www.dol.gov/agencies/eta/foreign-labor/performance`. Most recent (Q1 FY2026) covers Oct 1–Dec 31 2025. Each record includes: employer FEIN, employer name, SOC code, job title, wage offered, prevailing wage, worksite city/state, decision (Certified / Denied / Withdrawn), decision date.

**Secondary:** USCIS H-1B Employer Data Hub. Annual employer-level petition counts (initial vs continuing, approved vs denied) at `https://www.uscis.gov/h-1b-employer-data-hub`.

**Tertiary:** USCIS PERM data (for green-card sponsorship signals), DOS visa bulletin (for current backlog by category), public OPT/STEM-OPT employer lists where available.

### 5.2 Ingestion pipeline

A scheduled job (use existing `node-cron` infrastructure):
- Quarterly: download new DOL LCA file, parse, upsert to `lca_records` table.
- Annually (or on USCIS update): refresh `uscis_petitions` table.
- Nightly: recompute per-employer + per-(employer,SOC) aggregates → `employer_visa_stats` table.

### 5.3 Per-job visa scoring

For a given (user, job) pair where user needs sponsorship:

```ts
function calculateVisaCompatibility(user: User, job: Job): Subscore {
  const employer = matchEmployer(job.company);  // FEIN match if possible, else fuzzy name
  const socCode = inferSOC(job.title, job.description);

  if (!employer) {
    return {
      value: 0.30,
      weight: w.visa,
      confidence: 0.10,
      evidence: ['Employer not found in DOL records — sponsorship history unknown']
    };
  }

  const stats = getEmployerStats(employer.fein, socCode);
  // stats: { totalLCAs24mo, certifiedCount, deniedCount, medianWageOffered,
  //          lastSponsoredAt, totalLCAsAllTime, distinctSOCsSponsored }

  const recencyFactor = stats.lastSponsoredAt
    ? Math.exp(-daysSince(stats.lastSponsoredAt) / 365)
    : 0;

  const volumeFactor = Math.min(stats.totalLCAs24mo / 20, 1.0);  // 20+ LCAs = max signal

  const approvalRate = stats.certifiedCount / Math.max(stats.totalLCAs24mo, 1);

  const wageFactor = job.salaryMin && stats.medianWageOffered
    ? clamp(job.salaryMin / stats.medianWageOffered, 0, 1.2) / 1.2
    : 0.5;  // unknown wage = neutral

  const value = 0.35 * recencyFactor
              + 0.25 * volumeFactor
              + 0.25 * approvalRate
              + 0.15 * wageFactor;

  const evidence = [
    `${stats.totalLCAs24mo} LCAs filed in last 24mo for SOC ${socCode}`,
    `${(approvalRate * 100).toFixed(0)}% certified`,
    `Last sponsored: ${stats.lastSponsoredAt ?? 'never in this SOC'}`,
    `Median wage offered: $${stats.medianWageOffered ?? 'n/a'}`
  ];

  const confidence = clamp(stats.totalLCAs24mo / 5, 0, 1);

  return { value, weight: w.visa, confidence, evidence };
}
```

This produces an honest signal grounded in real public data. Compare to v1, where the score is a hardcoded weight on `job.sponsorsVisa` boolean and a hardcoded `h1bApprovalRate` decimal.

### 5.4 Multi-visa coverage

The user's `visaStatus` enum extends from `{us_citizen, green_card, h1b, opt, f1, other}` to a richer model:

```ts
type WorkAuth = {
  status: 'us_citizen' | 'green_card' | 'h1b' | 'h4_ead'
        | 'l1' | 'l2_ead' | 'opt' | 'stem_opt' | 'cpt'
        | 'e3' | 'tn' | 'o1' | 'j1' | 'asylum_ead' | 'other';
  expiresAt?: Date;
  sponsorshipNeededWithin?: number;  // months
  citizenshipFor?: string;           // for E-3 (Australia), TN (Canada/Mexico), H-1B1 (Chile/Singapore)
};
```

The visa compatibility scorer then handles each status correctly:
- **us_citizen / green_card**: skip the layer entirely, weight 0.
- **h1b / h4_ead with future expiry**: score based on employer's H1B transfer track record.
- **opt / stem_opt**: score based on employer's history of transitioning OPT to H1B AND the user's degree CIP code (STEM-eligible employers get bonus).
- **f1**: score based on whether employer hires new grads AND sponsors OPT/STEM-OPT.
- **e3 / tn / h1b1**: score based on employer's history with that specific category (some employers do H1B but not TN).
- **o1**: filter to employers with O-1 history (rare; this is a small cohort).

### 5.5 Salary safe harbor

The DOL data includes wage levels (I–IV). Every visa salary must meet the prevailing wage. We compute, for each (employer, SOC, location), the prevailing wage. If `job.salaryMin < prevailingWage`, surface a warning: *"This salary is below the prevailing wage required for H-1B sponsorship in this SOC and location. The employer may not be able to sponsor at this band."* This is a value-add no consumer competitor offers.

---

## 6. Job authenticity layer

This is the ghost-job killer. It runs independently of the match score.

### 6.1 Liveness checks

For every job in our DB:
- Re-poll the canonical URL daily.
  - HTTP 200 + parseable job content → still live
  - HTTP 404 / 410 / redirect-to-listings-page → expired, mark `expired_at`
- Track `posting_age_days = now - first_seen_at`.
- Track `last_modified_at` if the source provides it.

### 6.2 Ghost-job heuristics

A logistic classifier predicts `P(ghost)` from features:
- `posting_age_days` (older → more suspicious)
- `repost_count` (re-posted ≥ 3 times → suspicious)
- `recruiter_active_recently` (no recruiter activity in 30d → suspicious)
- `applicant_count_growth` (zero applicants over 14d → suspicious)
- `description_length` (very short or generic → suspicious)
- `salary_band_present` (missing → mildly suspicious)
- `employer_post_velocity` (employer posts 100s of identical roles → suspicious)
- `cross_referenced_on_employer_career_page` (not present → very suspicious)

Train on a labeled dataset. Bootstrap labels by tracking jobs over 60 days and labeling "still posted, no applicants moved past screening" as ghost candidates. Recruiter-side data eventually provides ground truth ("we never opened a req for this").

Output: `livenessProbability` (0–1) and `ghostJobRisk` (low / medium / high).

### 6.3 UI policy

- `ghost_risk = high` jobs are hidden by default. Setting to opt back in.
- `medium` jobs are surfaced with a visible badge.
- `low` jobs are unmarked (the silent default = trust).

### 6.4 Honesty Dashboard metric

Publicly track: "Of jobs surfaced this week, what % were confirmed live within 24h of being shown?" Target ≥95%.

---

## 7. Recruiter-calibrated learning loop

Once Phase 3 is live, every recruiter thumbs-up/down on a candidate becomes a labeled training example for the calibration model.

### 7.1 Per-recruiter scoring config (from your existing v1 design)

Keep the company-specific match logic JSON config from your PDF:

```json
{
  "skills": {"Python": 1.4, "SQL": 1.2},
  "degree": {"MS": 1.0, "PhD": 1.5},
  "title_keywords": {"Data Analyst": 1.3},
  "min_experience": 2
}
```

Apply this as a **post-multiplier** to the calibrated probability when surfacing candidates to that specific recruiter:

```
recruiter_facing_p = clamp(global_p × applyConfig(candidate, config), 0, 1)
```

### 7.2 Global model retraining

Every week:
- Aggregate the past week's (candidate, job, recruiter_decision) tuples.
- Add to the training set.
- Retrain the calibration model.
- A/B test the new model against the prior version on 5% of traffic for 48h before full rollout.

### 7.3 Per-role-family weight refinement

After enough recruiter data accumulates (≥1000 outcomes per role family), retrain the combiner weights per role family. This is where SwipeHire compounds: the more recruiter-side activity, the better the candidate-side scores get, the more candidates trust the platform, the more recruiters get quality applicants. Flywheel.

---

## 8. Resume tailoring v2 (the evidence-grounded version)

Specified here briefly because it shares the skill-features pipeline with the matcher.

**Inputs:** user's `originalResumeContent`, parsed structure, the JD, and the `SkillFeatures.matched` + `unmatched` from §3.1.

**Steps:**

1. **Plan first, write second.** Generate a JSON plan: for each JD requirement, identify the resume bullet that should match it (or mark as "no evidence"). Show this plan to the user before any rewriting happens.

2. **Per-bullet rewrite, not whole-resume rewrite.** For each (jdRequirement, resumeEvidence) pair, generate a rewritten bullet that:
   - Uses the JD's vocabulary for the matched skill.
   - Preserves all numbers, names, and dates from the original (no hallucination).
   - Stays within ±15% of original word count (no padding).
   - Avoids "GPT default" phrases (banned-word list: leveraged, spearheaded, passionate about, results-driven, synergize, etc.).

3. **Style fingerprint check.** Run the rewritten resume through a small classifier trained to distinguish human from GPT-default writing. If `P(GPT-default) > 0.4`, regenerate with stronger constraints.

4. **ATS-real format check.** Parse the output through actual ATS parsers (Greenhouse parses with Sovren; Lever uses RChilli; etc. — most expose the parsed structure). Show the user the JSON the ATS will receive. Flag any sections that didn't parse correctly.

5. **Diff view.** Show the user a side-by-side diff with every change highlighted, every change traceable to a JD requirement. Approve all / reject all / edit per-bullet.

6. **Never auto-submit unreviewed.** Hard rule. The user always sees the final version before it goes out.

This addresses Jobright's "resume generator is horrible" complaint structurally — by constraining the model with evidence rather than letting it ad-lib.

---

## 9. Worked example

To verify the spec, here's the algorithm running on a plausible scenario.

**Candidate:**
- F-1 visa, on STEM-OPT, expires in 18 months
- Target: Senior Software Engineer, Backend, fintech
- Skills: Go, Postgres, Kafka, AWS, Python, SQL
- 6 YoE, last role at a payments startup
- Preferred: NYC or remote
- Expected: $180-220k

**Job:**
- "Staff Backend Engineer, Payments" at Stripe (NYC)
- Requirements: 7+ years Go or Java, distributed systems, payments domain, Kafka, AWS
- Sponsors visa: yes
- Salary: $230-310k
- Posted 8 days ago, 47 applicants

**Subscores:**

| Subscore             | Value | Confidence | Notes |
|----------------------|-------|------------|-------|
| skillsSemantic       | 0.86  | 0.90       | 5/6 JD reqs matched with evidence; missing: "7+ years Go" (candidate has 4y Go, 6y total) |
| titleAlignment       | 0.78  | 0.95       | Same family (Backend Engineer); seniority gap of 1 level (Senior → Staff) |
| seniorityFit         | 0.55  | 0.90       | Asymmetric penalty for under-leveling |
| locationFit          | 1.00  | 1.00       | NYC ↔ NYC |
| domainExperience     | 1.00  | 0.95       | Payments → Payments, direct match |
| visaCompatibility    | 0.92  | 0.95       | Stripe: 142 LCAs in 24mo, SOC 15-1252, 96% certified, last sponsored 11 days ago, median wage $210k (above prevailing $185k) |
| salaryFit            | 0.95  | 0.90       | $200k expected, $230-310k offered → at low end of range, comfortable |
| recencySignal        | 0.78  | 0.80       | 8 days old, healthy applicant velocity |

**Combiner (using learned weights for "Backend Engineer" family):**

```
raw = 0.32×0.86 + 0.18×0.78 + 0.13×0.55 + 0.10×1.00 + 0.08×1.00 + 0.10×0.92
    + 0.05×0.95 + 0.04×0.78
    = 0.275 + 0.140 + 0.072 + 0.100 + 0.080 + 0.092 + 0.048 + 0.031
    = 0.838
```

**Calibrator** maps raw=0.84 → interviewProbability=0.71 (calibration shows raw 0.84 historically corresponds to 71% interview rate for this role family).

**Confidence interval:** [0.63, 0.78] (tight because all subscores have high confidence).

**Label:** Strong fit (p ≥ 0.70 AND CI width = 0.15 ≤ 0.20).

**Authenticity:** liveness 0.97, ghost risk = low (recruiter active, growing applicant count, posting on Stripe's own career page cross-referenced).

**Visa intel:** Strong sponsor for this SOC, recent activity, salary above prevailing wage.

**Explanation:**
- Top reasons to apply: "Direct payments domain match", "Stripe sponsors aggressively in this SOC", "Salary well within band"
- Top reasons to hesitate: "Job asks for 7y Go; you have 4y", "Listed at Staff level; you target Senior"
- Missing evidence: "7+ years Go specifically — your 4y is recent and strong but doesn't match the headline ask"

This is the kind of output a user can act on — and a recruiter can trust. Compare to v1's bare "84% MATCH" with no breakdown, no honesty about the seniority gap, and a fake H1B grade.

---

## 10. What changes in code

This is the bridge from spec to implementation. Each item is a discrete PR.

### 10.1 Schema additions (additive, no migrations break)

```sql
-- New tables
CREATE TABLE lca_records (
  id BIGSERIAL PRIMARY KEY,
  fein TEXT NOT NULL,
  employer_name TEXT NOT NULL,
  soc_code TEXT NOT NULL,
  job_title TEXT,
  wage_offered NUMERIC,
  prevailing_wage NUMERIC,
  worksite_city TEXT,
  worksite_state TEXT,
  decision TEXT NOT NULL,           -- 'Certified' | 'Denied' | 'Withdrawn'
  decision_date DATE,
  fiscal_quarter TEXT,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX (fein, soc_code),
  INDEX (employer_name)
);

CREATE TABLE employer_visa_stats (
  id BIGSERIAL PRIMARY KEY,
  fein TEXT NOT NULL,
  soc_code TEXT,                    -- NULL = all SOCs aggregated
  total_lcas_24mo INT,
  certified_count INT,
  denied_count INT,
  median_wage_offered NUMERIC,
  last_sponsored_at DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fein, soc_code)
);

CREATE TABLE score_outcomes (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  job_id INT,
  match_result JSONB,               -- the full MatchResult at scoring time
  outcome TEXT,                     -- 'applied' | 'screen' | 'interview' | 'offer' | 'rejected' | 'no_response'
  outcome_at TIMESTAMPTZ,
  scored_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_liveness_checks (
  id BIGSERIAL PRIMARY KEY,
  job_id INT NOT NULL,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  http_status INT,
  is_live BOOLEAN,
  parser_version TEXT
);

CREATE TABLE skill_taxonomy (
  id SERIAL PRIMARY KEY,
  canonical TEXT UNIQUE NOT NULL,
  aliases TEXT[],
  embedding VECTOR(1024),           -- requires pgvector
  category TEXT
);

-- Additions to existing tables
ALTER TABLE jobs ADD COLUMN soc_code TEXT;
ALTER TABLE jobs ADD COLUMN canonical_url TEXT;
ALTER TABLE jobs ADD COLUMN first_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN last_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN expired_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN ats_type TEXT;          -- 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'custom'
ALTER TABLE jobs ADD COLUMN ats_external_id TEXT;
ALTER TABLE jobs ADD COLUMN ghost_risk TEXT;        -- computed nightly
ALTER TABLE jobs ADD COLUMN liveness_probability NUMERIC;
ALTER TABLE jobs ADD COLUMN raw_match_features JSONB;

ALTER TABLE companies ADD COLUMN fein TEXT UNIQUE;
ALTER TABLE companies ADD COLUMN sponsorship_summary JSONB;
ALTER TABLE companies ADD COLUMN last_sponsored_at DATE;

ALTER TABLE users ADD COLUMN work_auth JSONB;       -- richer than the visaStatus enum
ALTER TABLE users ADD COLUMN cip_code TEXT;         -- for STEM-OPT eligibility
ALTER TABLE users ADD COLUMN linkedin_url TEXT;
ALTER TABLE users ADD COLUMN github_url TEXT;
```

### 10.2 New services (drop-in)

```
server/scoring/
  ├── featureExtractor.ts      // §3
  ├── subscores/
  │     ├── skills.ts
  │     ├── title.ts
  │     ├── seniority.ts
  │     ├── location.ts
  │     ├── domain.ts
  │     ├── visa.ts
  │     ├── salary.ts
  │     └── recency.ts
  ├── combiner.ts              // §4.1
  ├── calibrator.ts            // §4.2
  ├── ciEstimator.ts           // §4.3
  └── matcher.ts               // entry point — replaces v1 jobMatcher.ts

server/visa/
  ├── ingestDolLca.ts          // §5.2 — quarterly job
  ├── ingestUscisHub.ts
  ├── employerMatcher.ts       // company name → FEIN
  ├── socClassifier.ts         // job title + JD → SOC code
  └── statsCompute.ts          // nightly aggregates

server/authenticity/
  ├── livenessChecker.ts       // §6.1 — daily job
  └── ghostClassifier.ts       // §6.2

server/tailoring/
  ├── planner.ts               // §8 step 1
  ├── bulletRewriter.ts        // §8 step 2
  ├── styleFingerprint.ts      // §8 step 3
  ├── atsParserCheck.ts        // §8 step 4
  └── diffView.ts              // §8 step 5

server/ml/                     // python sidecar via REST (FastAPI)
  ├── embeddings.py
  ├── isotonic_calibrator.py
  ├── ghost_classifier.py
  └── server.py
```

### 10.3 Migration strategy from v1

- Keep v1 `jobMatcher.ts` running alongside v2 `matcher.ts` behind a feature flag (`USE_MATCHER_V2=true`).
- For 2 weeks, score every job with both and log the difference. Manually review divergences.
- A/B test on 10% of users: which version drives more interviews?
- Once v2 wins, deprecate v1.

The scaffolded codebase in `C:\SwipeHire\SwipeHire` (Deliverable #5) will set this up.

---

## 11. Open questions for the user

These are decisions that affect implementation but I don't want to assume:

1. **Embedding model:** OpenAI `text-embedding-3-small` ($0.02/M tokens, easy) or self-host `bge-large-en-v1.5` (free, more setup)? My recommendation: start with OpenAI for speed, plan migration to self-host once cost crosses ~$100/mo.

2. **Python sidecar or all-TypeScript?** Calibration models are easier in Python (sklearn). All-TypeScript means deploying simpler. My recommendation: small FastAPI sidecar (~50 lines) for calibration; TypeScript for everything else.

3. **pgvector or external vector DB?** pgvector keeps everything in Postgres. Pinecone/Weaviate is faster at scale. My recommendation: pgvector through 100k vectors, then reconsider.

4. **DOL ingest cadence:** quarterly is the official cadence, but we can scrape the LCA tracker sites (h1bgrader.com, h1bdata.info) for sub-quarter updates. Worth it? My recommendation: ingest official quarterly, plus weekly delta scrape from H1BGrader for freshness.

5. **Recruiter-side calibration consent:** when a recruiter thumbs-down a candidate, is that data used to retrain the global model only, or also surfaced back to the candidate ("a recruiter passed on you for this kind of role")? My recommendation: global retraining only, never surfaced back — protects candidate privacy and recruiter latitude.

These are flagged for the architecture doc (Deliverable #3) where we lock the actual choices.
