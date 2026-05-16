/**
 * Cover letter HTML template — fully parameterized.
 */
import type { GeneratedCoverLetter } from './types.js';

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function contactLine(cl: GeneratedCoverLetter): string {
  const parts: string[] = [];
  if (cl.contact.location) parts.push(esc(cl.contact.location));
  if (cl.contact.phone) parts.push(esc(cl.contact.phone));
  if (cl.contact.email) parts.push(`<a href="mailto:${esc(cl.contact.email)}">${esc(cl.contact.email)}</a>`);
  if (cl.contact.linkedin) {
    const u = cl.contact.linkedin.startsWith('http') ? cl.contact.linkedin : `https://${cl.contact.linkedin}`;
    parts.push(`<a href="${esc(u)}">LinkedIn</a>`);
  }
  if (cl.contact.portfolio) {
    const u = cl.contact.portfolio.startsWith('http') ? cl.contact.portfolio : `https://${cl.contact.portfolio}`;
    parts.push(`<a href="${esc(u)}">Portfolio</a>`);
  }
  return parts.join(' &middot; ');
}

export function renderCoverLetterHtml(cl: GeneratedCoverLetter): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(cl.candidateName)} — Cover letter — ${esc(cl.role)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0; }
  body { font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.42; color: #111; width: 8.5in; min-height: 11in; max-height: 11in; overflow: hidden; margin: 0 auto; padding: 0.6in 0.7in; background: #fff; }
  .hdr { border-bottom: 1.2pt solid #1a56db; padding-bottom: 8pt; margin-bottom: 16pt; }
  .hdr h1 { font-size: 17pt; font-weight: 700; letter-spacing: 0.3pt; margin-bottom: 3pt; color: #0a0a0a; }
  .hdr .ct { font-size: 9.5pt; color: #444; }
  .hdr a { color: #1a56db; text-decoration: none; }
  .meta { font-size: 9.5pt; color: #555; margin-bottom: 14pt; }
  .meta strong { color: #111; font-weight: 700; }
  .greeting { font-size: 10.5pt; margin-bottom: 11pt; font-weight: 600; color: #0a0a0a; }
  p { margin-bottom: 9pt; }
  strong { color: #0a0a0a; font-weight: 700; }
  ul { margin: 4pt 0 10pt 0; padding-left: 18pt; }
  li { margin-bottom: 4pt; }
  .sig { margin-top: 14pt; font-size: 10.5pt; }
  .sig .name { font-weight: 700; color: #0a0a0a; }
  .sig .contact { font-size: 9.5pt; color: #555; margin-top: 2pt; }
</style>
</head>
<body>
<div class="hdr">
  <h1>${esc(cl.candidateName.toUpperCase())}</h1>
  <div class="ct">${contactLine(cl)}</div>
</div>

<div class="meta"><strong>To:</strong> Hiring Team, ${esc(cl.company)} &nbsp;&middot;&nbsp; <strong>Role:</strong> ${esc(cl.role)} &nbsp;&middot;&nbsp; <strong>Date:</strong> ${esc(cl.date)}</div>

<div class="greeting">Hiring Team, ${esc(cl.company)},</div>

${cl.bodyHtml}

<div class="sig">
  <p>Looking forward to talking.</p>
  <div class="name">${esc(cl.candidateName)}</div>
  <div class="contact">${esc(cl.contact.email)}${cl.contact.phone ? ` &middot; ${esc(cl.contact.phone)}` : ''}${cl.contact.linkedin ? ` &middot; ${esc(cl.contact.linkedin.replace(/^https?:\/\//,''))}` : ''}</div>
</div>
</body>
</html>`;
}
