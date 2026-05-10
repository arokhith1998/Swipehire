# SwipeHire — YC Summer 2026 Application Draft

**How to use:** Copy each answer into the YC form. Items in `[BRACKETS]` are placeholders — fill in your facts. Things marked `EDIT:` are calls where you should make a personal judgment, not me.

I drafted these against the standard YC application questions (the form has been stable for years). If a question's wording in your form is different, the substance still applies — just trim.

---

## Company basics

**Company name:** SwipeHire

**Company URL:** https://swipehire.io

**One-line description (the "what"):**
> Visa-aware job matching that doesn't lie to you. Calibrated match scores, real DOL sponsorship data, and auto-apply that actually works — built for the 1M+ international students entering the US workforce every year.

**Where are you based now? Where will you be based after the batch?**
> [CITY, STATE — likely Rochester, NY given your university]. We'll relocate to the Bay Area for the duration of the YC batch.

---

## Founders & team

**Who are your founders, and what are their backgrounds? (LinkedIn URLs welcome)**

> Adhithya Bhaskar — building SwipeHire because I am the customer. International student at the University of Rochester on F-1 STEM OPT. Over the last year I've evaluated 200+ job offers across marketing, PM, and growth roles using every "AI job copilot" on the market. I've seen first-hand how broken visa-aware matching is and where the honest gaps are. Background: [EDIT: 1-2 lines on relevant prior experience, internships, projects — be specific about quantitative impact if any].
>
> [CO-FOUNDER NAME] — [EDIT: their role + 2-3 lines on background, especially anything technical, market-relevant, or distribution-related. If they're also international/visa, mention it — it doubles down on founder-market fit].
>
> LinkedIn: [Adhithya] · [Co-founder]

**How long have the founders known one another and how did you meet?**
> [EDIT: e.g., "We met at the University of Rochester in 2024 and have collaborated on [specific project]." YC weights this — if you've worked together on anything before SwipeHire, name it specifically.]

**Are all of you full-time on this?**
> [EDIT — pick one and adapt:]
>
> A) Yes, full-time. (If true now or by the time the batch starts.)
>
> B) Adhithya is full-time. [Co-founder] is currently [school / job] but will go full-time on Day 1 of the batch if we're accepted.
>
> C) Both of us are part-time today (Adhithya is finishing STEM OPT requirements / [Co-founder] is at [employer]) — both committed to going full-time on acceptance.
>
> Avoid wishy-washy phrasing. YC funds full-time founders. If you can't say "yes" today, say exactly when you will go full-time.

---

## Legal, funding, fundraising

**Have you incorporated, or formed any legal entity yet?**
> Not yet. We will incorporate as a Delaware C-Corp when we accept YC's offer.

**Have you taken any investment yet?**
> No.

**Are you currently fundraising?**
> No. SwipeHire has been entirely self-funded. We are applying to YC as our first source of outside capital.

---

## What you're building

**What is your company going to make? (longer answer — 3-5 sentences)**
> SwipeHire is a job-matching platform built for international candidates who need US visa sponsorship. Three things make it different from every other "AI job copilot." First, our match scores are calibrated probabilities of getting an interview — published with a confidence interval and a public weekly accuracy dashboard. Competitors inflate scores to drive engagement; we refuse. Second, our visa intelligence ingests DOL Office of Foreign Labor Certification data (4.8M+ LCA records since 2013) to show per-employer sponsorship history at the SOC-code level, with salary safe-harbor warnings. Competitors use lagging USCIS data plus keyword filters. Third, our auto-apply works in two tiers: server-side via Greenhouse/Lever/Ashby for stable ATSs, and a browser extension for everything else (Workday, iCIMS, custom). We never click Submit for the user — they always have the final tap.

**What's new about what you're making? What substitutes do people resort to because it doesn't exist yet (or they don't know about it)?**
> What's new: combining calibrated honest matching + deep visa intelligence + dual-mode auto-apply (server + extension) in one product, with public accuracy reporting. No incumbent does any one of these well, let alone all three.
>
> Substitutes today: Jobright.ai (the loudest player) overpromises auto-apply that's mostly broken, has weak visa data, and inflates match scores; Trustpilot is full of cancellation complaints. LazyApply blasts thousands of generic applications, killing response rates. Simplify is a free Chrome extension that just autofills, with no matching engine. Teal is a tracker, not an apply tool. International candidates default to applying through LinkedIn directly, where 27% of postings are confirmed ghost jobs and recruiters can't filter for visa-eligible candidates.

**Why did you pick this idea to work on? Do you have domain expertise?**
> I picked it because I am the customer. I've spent the last year on F-1 STEM OPT applying to marketing, PM, and growth roles. I've personally used Jobright, LazyApply, Simplify, and Teal. I've felt every failure mode — ghost jobs, wrong visa filters, broken auto-apply, AI-generated resumes that get filtered out by ATSs.
>
> Domain expertise: I built a complete personal job-search operations system in code (career-ops) that tracked 200+ evaluations, generated tailored resumes, and ran liveness checks on postings. That's the prototype that proved every gap competitors leave open. I know exactly what international candidates need because I've lived the search.
>
> [CO-FOUNDER]: [EDIT: their relevant expertise — distribution, ML, recruiting, B2B sales, whatever fits].

---

## Differentiation, competitors, moat

**Who are your competitors, and who might become competitors? Who do you fear most?**
> Direct: Jobright.ai (loudest in our segment), LazyApply, Simplify, Teal, Sonara, AIApply.
>
> Adjacent that could pivot in: Indeed, LinkedIn (massive distribution but slow to ship), and a tier of YC-backed job-search startups that haven't focused on the visa angle.
>
> Who we fear most: Jobright. They have brand recognition with international students and an existing H-1B filter. But their structural problem is their match scores are inflated for engagement and their auto-apply doesn't actually work — both of which are baked into their growth model. The day they get serious about calibration is the day they have to tell users "actually that 95% match was 30%." That's a hard pivot. They likely won't make it. Simplify is the more dangerous long-term competitor because they have the extension footprint we want — but they have no matching engine, and bolting one on credibly takes years.

**What do you understand about your business that other companies in it just don't get?**
> Three things.
>
> First: in the AI-job-search category, **trust compounds and inflation decays**. Every "95% match" that turns out to be a 30% match destroys long-run engagement. Every competitor optimizes for short-term swipe-through; we optimize for long-run trust. We refuse to display a probability when our data confidence is below threshold ("Insufficient data" is a label we ship). This is structurally hard for incumbents to copy because it would require them to admit their current numbers are smoke.
>
> Second: **the visa-aware market is winner-take-most**. Once you have the canonical DOL ingestion + per-employer sponsorship rollup + salary safe-harbor checks, you become the default reference for the international candidate community. They share what works in tight networks (university Slacks, OPT subreddits, Discord servers). We've seen this dynamic personally — recommendations propagate fast in our segment.
>
> Third: **the recruiter side is the calibration moat, not the recruiter side is the revenue**. Once recruiters give thumbs up/down on candidates, those decisions train the matching model. Jobright doesn't have a recruiter product. Simplify doesn't either. We built both sides because the recruiter side is what makes the candidate side better over time. The flywheel only spins if both wheels exist.

---

## Business model

**How do or will you make money? How much could you make?**

> Three revenue lines, in launch order:
>
> **1. Candidate-side freemium ($15/mo Pro).** Free tier: 10 swipes/day, basic visa intel. Pro tier: unlimited swipes, full per-employer DOL breakdown, 50 auto-applies/day, ATS-real format check on tailored resumes, browser extension. Conversion target: 6-8% of activated users (industry baseline for productivity tools is 2-4%; visa-aware audience has higher willingness-to-pay because the alternative is unemployment).
>
> **2. Recruiter SaaS ($299–$1,499/active job/month, Phase 3).** Targets mid-market recruiters at companies that sponsor visas — the underserved gap between Greenhouse/Lever (ATS only) and Eightfold/HireEZ (enterprise-only sourcing). Verified-Sponsor badge included. ATS write-back to Greenhouse/Lever/Ashby. Per-active-job pricing scales with usage, friendly to SMB.
>
> **3. Visa-data API (Phase 4).** University career services and immigration law firms pay for our DOL+USCIS+prevailing-wage rollup as an API. Usage-based: $0.10/employer-lookup, $5k/mo enterprise floor.
>
> **TAM math:** ~1M international students enter the US per year. ~200k STEM graduates need H-1B sponsorship within 24 months of graduation. At 30% market share × $180/year average revenue per candidate = $11M ARR from candidates alone. Add recruiter SaaS (~5,000 mid-market sponsoring companies × $5k/yr ACV) = another $25M. Add API + adjacent visas (E-3, TN, O-1, EB) = ballpark $50M+ ARR achievable within 3-4 years.

---

## Distribution

**How will you get users? If your idea is the type that faces a chicken-and-egg problem, how will you overcome it?**

> Two channels work for our segment, both organic:
>
> **University-network distribution.** International students cluster in university Slack/WhatsApp/Discord groups by school, by program, by visa status. Recommendations propagate fast in these networks because the alternative (Jobright at $40/mo for broken software) is so visibly inferior. We start with the University of Rochester, expand to the ~200 US universities with large international STEM populations. Cost-per-acquisition through this channel is functionally zero.
>
> **The Honesty Dashboard as content marketing.** We publish weekly: "of jobs we labeled 70-80% probability, X% led to interviews." Competitors won't follow because their numbers would embarrass them. This becomes the SEO/social moat — every blog post comparing job-search tools has to cite our public numbers.
>
> **Chicken-and-egg solution for the recruiter side:** we don't need the recruiter side to launch the candidate side, because our matching uses public DOL data, not recruiter-supplied data. Recruiters come on later (Phase 3), drawn by the verified-sponsor badge giving them top-of-funnel access to the international candidate pool we've already aggregated.

---

## Tech & progress

**Who writes code, or does other technical work on your product? Was any of it done by a non-founder?**
> [EDIT: typically "I write all the code" if solo-technical, or "Adhithya leads engineering, [Co-founder] handles [X]" if split.] All code is built by the founders. No outsourcing.

**How far along are you?**
> Live at swipehire.io with a full v1 (built on Replit, deployed): React/TS/Vite frontend, Node/Express/Postgres/Drizzle backend, OpenAI-powered resume tailoring, Google OAuth, swipe interface, recruiter side scaffolded. ~5,000 lines of TypeScript.
>
> v2 in active build: monorepo with apps/web + apps/api + apps/ml-sidecar (Python FastAPI for embeddings + calibration) + apps/worker (Playwright-based liveness + auto-apply) + apps/extension (Manifest V3 Chrome extension). Shared packages for types, DB schema, and field-mapping logic between server and extension. Calibrated scoring engine, DOL OFLC ingest pipeline, ghost-job detection, Honesty Dashboard. ~15,000 lines of TypeScript and Python in the v2 spine.
>
> Traction: [EDIT — write the actual number, e.g. "200-person waitlist organically grown from 4 university Slack channels"]. Beta users actively swiping daily. We've collected ~[X] outcome events that will train the v1 calibration model.

**How much of your code have you written so far? (If YC asks)**
> 100% by founders. We use AI-assisted coding (Claude Code) as a velocity multiplier but every architectural decision and most lines of business logic are reviewed and committed by us.

**How long have you been working on it?**
> Approximately [4-5] months. The first prototype was a personal Node.js + Playwright pipeline I built for my own job search ("career-ops"), which evaluated 200+ offers and generated tailored resumes for me. SwipeHire is the productized version, started [3-4] months ago.

---

## Surprises, ideas, judgment

**Have you discovered something surprising or amusing while building this?**

> Two things:
>
> Surprising: the Department of Labor publishes 4.8 million LCA records going back to 2013 — every H-1B petition's employer FEIN, SOC code, wage offered, prevailing wage, worksite. It's a free, definitive sponsorship dataset that's been sitting on a public URL for a decade. Jobright doesn't use it. Nobody serving international candidates uses it deeply. Built into our v2 scoring layer it gives us per-employer sponsorship signals competitors literally cannot match without months of data engineering they haven't done.
>
> Amusing: when I was using Jobright, the auto-apply broke on Workday so consistently that I started keeping a spreadsheet of which "high match" Workday roles I'd actually been able to submit to. The number was 3 out of 47. I sent that spreadsheet to Jobright support. They told me to "try clearing my cache." That was the moment I decided to build SwipeHire.

**If you had any other ideas you considered applying with, please list them.**
> [EDIT — be honest. If SwipeHire is your only serious idea, say so. If you considered others, list them in 1-line each. YC partners want to see judgment about why this idea over others.]
>
> Honest answer if SwipeHire is the focus: "SwipeHire is the only idea we're committed to. We considered briefly [B2B niche tool / consumer adjacent thing] but the founder-market fit and the structural moat (DOL data + calibration + dual auto-apply) made SwipeHire obviously the right one to build."

---

## Misc

**Why YC?**
> Three reasons.
>
> 1. **Network access to the right early users.** YC has the densest concentration of mid-market tech recruiters at companies that actively sponsor visas. They're the seed for our recruiter-side flywheel.
>
> 2. **Distribution to international founders.** A meaningful fraction of YC founders are themselves international (visa-needing) — they'll either use SwipeHire to hire or recommend it to peers, and the network effect kicks in fast.
>
> 3. **Pace and rigor.** We've shipped a substantial v2 architecture in the last two weeks. We can ship faster with YC partners pressure-testing every weekly assumption — particularly on monetization timing and recruiter-side GTM, where solo-founder blind spots are highest.

**Anti-discrimination policy:** Yes, we do not discriminate on any protected characteristic.

---

## Demo video URL

> [Paste the YouTube unlisted link to your 60-second video here]
>
> See `SCRIPT.md` and `RECORDING_GUIDE.md` for production.

---

# Critical placeholders to fill

Before you submit, replace these with real facts:

- [ ] Co-founder name + LinkedIn + 2-3 line background
- [ ] How long you've known each other + how you met
- [ ] Full-time status (both founders)
- [ ] Current city/state
- [ ] Adhithya's specific prior background (1-2 sharp lines on internships/projects)
- [ ] Waitlist or beta user count (be exact: "147 on the waitlist" beats "small waitlist")
- [ ] Outcome event count if any have happened
- [ ] Any prior collaborations between you and your co-founder (specific projects)
- [ ] Other ideas you considered (or commit fully to "this is the only one")
- [ ] Demo video URL (after you record)

---

# Editorial notes

**Tone the answers hit:** Direct, specific, no buzzwords. Indicative not subjunctive ("we do" not "we believe we will"). Specific numbers wherever they exist (4.8M LCA records, 27% ghost jobs, ~5k mid-market sponsoring companies). YC partners read hundreds of these per batch — specificity is what stands out.

**Words I deliberately avoided:** "AI-powered," "revolutionary," "disruptive," "best-in-class," "leveraging," "synergize," "next-generation," "passionate." Every one of these makes a YC reader's eyes glaze. Replaced with concrete mechanism descriptions.

**Things I deliberately did NOT include:**
- A team slide with photos. Solo or two founders + you can't fake a "team."
- A pitch deck reference. The video + the application is enough.
- Revenue projections beyond the realistic 3-4 year ARR sketch. YC partners ignore long projections.
- Comparisons to "the Uber of X" or "the Airbnb of Y." Always weak.

**One thing to consider before you submit:**

YC weights founder commitment heavily. If your co-founder is currently in school or another job, the **clearest possible "going full-time on Day 1"** is the answer they want. Vague hedges hurt more than blunt deferrals. If neither of you can commit before [DATE], say [DATE] explicitly.

Good luck.
