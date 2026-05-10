/**
 * Background service worker.
 *
 * Responsibilities:
 *   - Hold the SwipeHire session token (chrome.storage.local)
 *   - Sync the user's profile + tailored resumes from the API
 *   - Receive autofill requests from content scripts; return profile+answers
 *   - Receive submission reports from content scripts; forward to /api/extension/report
 *
 * Never injects DOM. Never sees the page directly. Pure data plane.
 */

import type { Profile } from '@swipehire/applier-core';

const API_BASE = (() => {
  // In dev, point to localhost. In prod, swipehire.io API.
  return chrome.runtime.getManifest().version.includes('dev')
    ? 'http://localhost:5000'
    : 'https://api.swipehire.io';
})();

interface Session {
  token: string;
  userId: number;
  expiresAt: string;
}

interface CachedProfile {
  profile: Profile;
  fetchedAt: number;
}

const STORAGE_KEYS = {
  session: 'swipehire.session',
  profile: 'swipehire.profile',
  tailoredResumes: 'swipehire.tailored_resumes',
} as const;

const PROFILE_TTL_MS = 60 * 60 * 1000;   // 1 hour

// =====================================================================
// Message router (content script ↔ background)
// =====================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'GET_PROFILE':         sendResponse(await getProfile()); break;
        case 'GET_TAILORED_RESUME': sendResponse(await getTailoredResume(msg.jobId)); break;
        case 'GET_SESSION':         sendResponse(await getSession()); break;
        case 'SET_SESSION':         await setSession(msg.session); sendResponse({ ok: true }); break;
        case 'CLEAR_SESSION':       await clearSession(); sendResponse({ ok: true }); break;
        case 'REPORT_AUTOFILL':     await reportAutofill(msg.report); sendResponse({ ok: true }); break;
        case 'REPORT_SUBMISSION':   await reportSubmission(msg.report); sendResponse({ ok: true }); break;
        case 'CLASSIFY_FIELD':      sendResponse(await classifyField(msg.label, msg.context)); break;
        default:                    sendResponse({ error: `Unknown message: ${msg.type}` });
      }
    } catch (err: any) {
      sendResponse({ error: err.message ?? String(err) });
    }
  })();
  return true;   // keep channel open for async response
});

// =====================================================================
// Session
// =====================================================================
async function getSession(): Promise<Session | null> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.session);
  const s = r[STORAGE_KEYS.session] as Session | undefined;
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    await clearSession();
    return null;
  }
  return s;
}

async function setSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.session]: session });
}

async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.session, STORAGE_KEYS.profile, STORAGE_KEYS.tailoredResumes]);
}

// =====================================================================
// Profile sync
// =====================================================================
async function getProfile(): Promise<Profile | null> {
  const cached = await chrome.storage.local.get(STORAGE_KEYS.profile);
  const c = cached[STORAGE_KEYS.profile] as CachedProfile | undefined;
  if (c && Date.now() - c.fetchedAt < PROFILE_TTL_MS) return c.profile;
  return await fetchProfile();
}

async function fetchProfile(): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;
  const r = await fetch(`${API_BASE}/api/extension/profile`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!r.ok) return null;
  const profile = (await r.json()) as Profile;
  await chrome.storage.local.set({
    [STORAGE_KEYS.profile]: { profile, fetchedAt: Date.now() } satisfies CachedProfile,
  });
  return profile;
}

// =====================================================================
// Tailored resume
// =====================================================================
async function getTailoredResume(jobId: number): Promise<{ url: string; content: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const r = await fetch(`${API_BASE}/api/extension/tailored-resume?jobId=${jobId}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!r.ok) return null;
  return await r.json();
}

// =====================================================================
// Outcome reporting (closes the loop for the calibrator)
// =====================================================================
interface AutofillReport {
  url: string;
  ats: string;
  jobId?: number;
  filledFields: string[];
  unfilledRequired: string[];
  humanRequiredFlags: string[];
  timestamp: string;
}

interface SubmissionReport {
  url: string;
  ats: string;
  jobId?: number;
  status: 'submitted' | 'cancelled_by_user' | 'failed';
  reason?: string;
  durationMs: number;
  timestamp: string;
}

async function reportAutofill(report: AutofillReport): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await fetch(`${API_BASE}/api/extension/report-autofill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(report),
  }).catch(() => undefined);
}

async function reportSubmission(report: SubmissionReport): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await fetch(`${API_BASE}/api/extension/report-submission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(report),
  }).catch(() => undefined);
}

// =====================================================================
// Field classification (for unknown forms)
// =====================================================================
async function classifyField(label: string, context: string): Promise<{ key: string; confidence: number } | null> {
  const session = await getSession();
  if (!session) return null;
  const r = await fetch(`${API_BASE}/api/extension/classify-field`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ label, context }),
  });
  if (!r.ok) return null;
  return await r.json();
}

// =====================================================================
// Action click — open SwipeHire if not signed in
// =====================================================================
chrome.action.onClicked.addListener(async () => {
  const session = await getSession();
  if (!session) {
    chrome.tabs.create({ url: `${API_BASE}/extension-login` });
  }
});

console.log('[SwipeHire] background worker started');
