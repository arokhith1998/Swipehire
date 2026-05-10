/**
 * Content script — runs on career pages.
 *
 * Flow:
 *   1. Detect ATS from URL/DOM.
 *   2. Find form fields using the matched AtsSpec selectors (or generic detection).
 *   3. Build a FormPreview by matching profile data to fields.
 *   4. Show the SwipeHire overlay: "We can fill X / Y fields. Review and confirm."
 *   5. On confirm: fill fields. On submit: user clicks the form's own submit button.
 *      The extension never auto-clicks Submit (per user policy: "Always confirm before submit").
 *   6. Report the autofill + submission outcome back to the API for calibration.
 */

import {
  detectAtsFromUrl, detectAtsFromDom, getSpecForAts,
  resolveFieldValue, classifyVisaQuestion, visaAnswer,
  type Profile, type AtsSpec, type FormPreview, type FieldSpec,
} from '@swipehire/applier-core';
import { renderOverlay, hideOverlay } from './overlay.js';

(async () => {
  // Don't run on non-application pages
  if (!hasFormCandidates()) return;

  const session = await sendMessage({ type: 'GET_SESSION' });
  if (!session || session.error) {
    showLoginNudge();
    return;
  }

  const profile: Profile | null = await sendMessage({ type: 'GET_PROFILE' });
  if (!profile) {
    showLoginNudge();
    return;
  }

  // Detect ATS — URL first, then DOM markers
  const urlDetect = detectAtsFromUrl(location.href);
  const domDetect = detectAtsFromDom(sel => document.querySelector(sel) !== null);
  const ats = domDetect.confidence > urlDetect.confidence ? domDetect.ats : urlDetect.ats;
  const spec = getSpecForAts(ats);

  // Build the preview
  const preview = await buildPreview(spec, profile);

  // Show overlay (always — never autofill silently)
  renderOverlay({
    preview,
    onConfirmFill: async () => {
      const result = await fillForm(spec, profile);
      sendMessage({
        type: 'REPORT_AUTOFILL',
        report: {
          url: location.href,
          ats: spec.ats,
          filledFields: result.filled,
          unfilledRequired: preview.unfilledRequired.map(f => f.key),
          humanRequiredFlags: preview.humanRequired,
          timestamp: new Date().toISOString(),
        },
      });
      hideOverlay();
      showPostFillToast(result.filled.length, preview.unfilledRequired.length);
    },
    onCancel: () => {
      hideOverlay();
      sendMessage({
        type: 'REPORT_SUBMISSION',
        report: {
          url: location.href,
          ats: spec.ats,
          status: 'cancelled_by_user',
          durationMs: 0,
          timestamp: new Date().toISOString(),
        },
      });
    },
  });

  // Watch for form submission (user clicks the page's own Submit button)
  watchForSubmission(spec);
})();

// =====================================================================
// Detection
// =====================================================================
function hasFormCandidates(): boolean {
  // Heuristic: page has at least one email-or-resume field.
  return !!document.querySelector('input[type="email"], input[type="file"], textarea');
}

// =====================================================================
// Preview construction
// =====================================================================
async function buildPreview(spec: AtsSpec, profile: Profile): Promise<FormPreview> {
  const filled: FormPreview['filledFields'] = [];
  const unfilledRequired: FormPreview['unfilledRequired'] = [];

  for (const field of spec.fields) {
    const el = findElement(field);
    if (!el) {
      if (field.required) unfilledRequired.push({ key: field.key, label: String(field.label), reason: 'field not found on page' });
      continue;
    }
    const value = resolveFieldValue(field, profile, getOptions(el));
    if (value !== undefined && value !== '') {
      filled.push({ key: field.key, label: String(field.label), value: String(value).slice(0, 100), required: !!field.required });
    } else if (field.required) {
      unfilledRequired.push({ key: field.key, label: String(field.label), reason: 'no profile value' });
    }
  }

  // Detect captcha / human-required
  const humanRequired = spec.humanRequiredSelectors
    .filter(sel => document.querySelector(sel))
    .map(sel => sel);

  const resumeFilePresent = !!document.querySelector('input[type="file"][name*="resume" i], input[type="file"]');

  return {
    ats: spec.ats,
    filledFields: filled,
    unfilledRequired,
    humanRequired,
    resumeFilePresent,
  };
}

// =====================================================================
// Filling
// =====================================================================
async function fillForm(spec: AtsSpec, profile: Profile): Promise<{ filled: string[] }> {
  const filled: string[] = [];
  for (const field of spec.fields) {
    const el = findElement(field);
    if (!el) continue;

    if (field.kind === 'file') {
      // Can't programmatically set file input value — show a hint
      continue;
    }

    if (field.kind === 'yesno' || field.kind === 'radio') {
      const opts = getOptions(el);
      const choice = field.optionResolver?.(profile, opts);
      if (choice && setRadioOrSelect(el, choice)) filled.push(field.key);
      continue;
    }

    if (field.kind === 'select') {
      const opts = getOptions(el);
      const choice = field.optionResolver?.(profile, opts) ?? resolveFieldValue(field, profile, opts);
      if (choice && setSelectValue(el as HTMLSelectElement, choice)) filled.push(field.key);
      continue;
    }

    const value = resolveFieldValue(field, profile);
    if (value === undefined || value === '') continue;
    setInputValue(el as HTMLInputElement | HTMLTextAreaElement, value);
    filled.push(field.key);
  }
  return { filled };
}

// =====================================================================
// DOM helpers
// =====================================================================
function findElement(field: FieldSpec): HTMLElement | null {
  // Try selectors first
  for (const sel of field.selectors) {
    try {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) return el;
    } catch { /* invalid selector */ }
  }
  // Fall back: label-based search (works for generic spec)
  const labels = Array.from(document.querySelectorAll('label')) as HTMLLabelElement[];
  for (const lbl of labels) {
    const labelText = (lbl.textContent ?? '').trim();
    if (matchesLabel(field.label, labelText)) {
      const id = lbl.htmlFor;
      if (id) {
        const el = document.getElementById(id);
        if (el) return el as HTMLElement;
      }
      const inner = lbl.querySelector('input, select, textarea') as HTMLElement | null;
      if (inner) return inner;
    }
  }
  return null;
}

function matchesLabel(spec: string | RegExp, text: string): boolean {
  if (typeof spec === 'string') return text.toLowerCase().includes(spec.toLowerCase());
  return spec.test(text);
}

function getOptions(el: HTMLElement): string[] {
  if (el.tagName === 'SELECT') {
    return Array.from((el as HTMLSelectElement).options).map(o => o.label);
  }
  // For radio fieldset
  const name = (el as HTMLInputElement).name;
  if (name) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    return Array.from(radios).map(r => {
      const lbl = (r as HTMLInputElement).labels?.[0];
      return lbl?.textContent?.trim() ?? (r as HTMLInputElement).value;
    });
  }
  return [];
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // React-friendly setter — must dispatch input event to trigger React state
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, label: string): boolean {
  for (const opt of Array.from(el.options)) {
    if (opt.label.trim() === label.trim()) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function setRadioOrSelect(el: HTMLElement, choice: string): boolean {
  if (el.tagName === 'SELECT') return setSelectValue(el as HTMLSelectElement, choice);
  // Radio: find the matching one
  const name = (el as HTMLInputElement).name;
  if (!name) return false;
  const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  for (const r of Array.from(radios)) {
    const lbl = (r as HTMLInputElement).labels?.[0]?.textContent?.trim();
    if (lbl === choice.trim()) {
      (r as HTMLInputElement).click();
      return true;
    }
  }
  return false;
}

// =====================================================================
// Submission watcher
// =====================================================================
function watchForSubmission(spec: AtsSpec) {
  const onSubmit = () => {
    const t0 = Date.now();
    setTimeout(() => {
      const success = !!document.querySelector(spec.successSelector);
      sendMessage({
        type: 'REPORT_SUBMISSION',
        report: {
          url: location.href,
          ats: spec.ats,
          status: success ? 'submitted' : 'failed',
          reason: success ? undefined : 'no success selector matched after 5s',
          durationMs: Date.now() - t0,
          timestamp: new Date().toISOString(),
        },
      });
    }, 5000);
  };
  document.addEventListener('submit', onSubmit, { once: false, capture: true });
  // Also listen for clicks on the spec's submit selector (some forms don't fire submit)
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.matches(spec.submitSelector) || target.closest(spec.submitSelector)) onSubmit();
  }, true);
}

// =====================================================================
// Misc
// =====================================================================
function showLoginNudge() {
  // TODO: small floating "Sign in to SwipeHire to auto-fill" pill
  console.log('[SwipeHire] not signed in — skipping autofill');
}

function showPostFillToast(filled: number, unfilled: number) {
  // TODO: toast: "✅ Filled X fields. Y still need your input. Review and tap Submit."
  console.log(`[SwipeHire] filled ${filled} fields, ${unfilled} need user input`);
}

function sendMessage<T = any>(msg: any): Promise<T> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}
