/**
 * Confirmation overlay — shown BEFORE any field is filled.
 *
 * "Always confirm before submit" is a hard product rule. The user sees
 * exactly what we're about to do. Then they click "Fill" — we fill —
 * they review the form themselves — they click the form's own Submit.
 *
 * We never click Submit on the user's behalf.
 */

import type { FormPreview } from '@swipehire/applier-core';

interface RenderOpts {
  preview: FormPreview;
  onConfirmFill: () => void;
  onCancel: () => void;
}

const OVERLAY_ID = 'swipehire-overlay';

export function renderOverlay(opts: RenderOpts) {
  hideOverlay();

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.innerHTML = buildHtml(opts.preview);
  document.body.appendChild(root);

  root.querySelector<HTMLButtonElement>('[data-action="fill"]')?.addEventListener('click', () => opts.onConfirmFill());
  root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener('click', () => opts.onCancel());
  root.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener('click', () => opts.onCancel());
}

export function hideOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function buildHtml(preview: FormPreview): string {
  const fillable = preview.filledFields.length;
  const unfillable = preview.unfilledRequired.length;
  const hasCaptcha = preview.humanRequired.length > 0;

  return `
    <div class="sh-overlay-backdrop" role="dialog" aria-modal="true" aria-labelledby="sh-overlay-title">
      <div class="sh-overlay-card">
        <header class="sh-overlay-header">
          <div class="sh-overlay-logo">
            <span class="sh-overlay-logo-mark">SH</span>
            <strong id="sh-overlay-title">SwipeHire</strong>
          </div>
          <button data-action="close" class="sh-overlay-close" aria-label="Close">×</button>
        </header>

        <section class="sh-overlay-body">
          <h2 class="sh-overlay-h2">Detected: <span class="sh-overlay-ats">${escape(preview.ats)}</span></h2>
          <p class="sh-overlay-summary">
            We can fill <strong>${fillable}</strong> field${fillable === 1 ? '' : 's'} from your profile.
            ${unfillable > 0 ? `<strong>${unfillable}</strong> required field${unfillable === 1 ? ' needs' : 's need'} your input.` : ''}
          </p>

          ${preview.filledFields.length > 0 ? `
            <details class="sh-overlay-details" open>
              <summary>What we'll fill</summary>
              <ul class="sh-overlay-list">
                ${preview.filledFields.map(f => `
                  <li>
                    <span class="sh-overlay-key">${escape(f.label.toString())}</span>
                    <span class="sh-overlay-value">${escape(f.value)}</span>
                  </li>
                `).join('')}
              </ul>
            </details>
          ` : ''}

          ${unfillable > 0 ? `
            <details class="sh-overlay-details">
              <summary>You'll need to fill manually</summary>
              <ul class="sh-overlay-list sh-overlay-list-warning">
                ${preview.unfilledRequired.map(f => `
                  <li><span class="sh-overlay-key">${escape(f.label.toString())}</span></li>
                `).join('')}
              </ul>
            </details>
          ` : ''}

          ${hasCaptcha ? `
            <div class="sh-overlay-warning">
              ⚠️ This page has a captcha — you'll need to solve it before submitting.
            </div>
          ` : ''}

          ${!preview.resumeFilePresent ? `
            <div class="sh-overlay-warning">
              ⚠️ No resume upload field detected. You may need to attach manually.
            </div>
          ` : ''}
        </section>

        <footer class="sh-overlay-footer">
          <button data-action="cancel" class="sh-overlay-btn-secondary">Not now</button>
          <button data-action="fill" class="sh-overlay-btn-primary">Fill ${fillable} field${fillable === 1 ? '' : 's'}</button>
        </footer>
        <p class="sh-overlay-fineprint">
          We'll never click Submit for you. After filling, review the form yourself and submit when ready.
        </p>
      </div>
    </div>
  `;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
