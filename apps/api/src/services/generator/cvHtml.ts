/**
 * CV HTML template — fully parameterized version of the career-ops template.
 * ATS-safe: single column, standard fonts, no tables, no images, hard 1-page cap.
 */
import type { GeneratedCV } from './types.js';

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactLine(cv: GeneratedCV): string {
  const parts: string[] = [];
  if (cv.contact.location) parts.push(esc(cv.contact.location));
  if (cv.contact.phone) parts.push(esc(cv.contact.phone));
  if (cv.contact.email) parts.push(`<a href="mailto:${esc(cv.contact.email)}">${esc(cv.contact.email)}</a>`);
  if (cv.contact.linkedin) {
    const u = cv.contact.linkedin.startsWith('http') ? cv.contact.linkedin : `https://${cv.contact.linkedin}`;
    const text = cv.contact.linkedin.replace(/^https?:\/\//, '');
    parts.push(`<a href="${esc(u)}">${esc(text)}</a>`);
  }
  if (cv.contact.portfolio) {
    const u = cv.contact.portfolio.startsWith('http') ? cv.contact.portfolio : `https://${cv.contact.portfolio}`;
    const text = cv.contact.portfolio.replace(/^https?:\/\//, '');
    parts.push(`<a href="${esc(u)}">${esc(text)}</a>`);
  }
  return parts.join(' <span class="sep">|</span> ');
}

function skillsBlock(cv: GeneratedCV): string {
  return cv.skills.map(s => `<p><strong>${esc(s.category)}:</strong> ${esc(s.items.join(', '))}</p>`).join('\n');
}

function experienceBlock(cv: GeneratedCV): string {
  return cv.experience.map(e => {
    const subParts = [esc(e.company)];
    if (e.location) subParts.push(esc(e.location));
    if (e.dates) subParts.push(esc(e.dates));
    return `
    <div class="ent">
      <div class="ttl">${esc(e.title)}</div>
      <div class="sub-meta">${subParts.join(' · ')}</div>
      <ul>${e.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>
  `;
  }).join('\n');
}

function projectsBlock(cv: GeneratedCV): string {
  if (!cv.projects?.length) return '';
  return cv.projects.map(p => {
    const subParts: string[] = [];
    if (p.link) subParts.push(`<a href="${esc(p.link)}">${esc(p.link.replace(/^https?:\/\//,''))}</a>`);
    if (p.dates) subParts.push(esc(p.dates));
    const subLine = subParts.length ? `<div class="sub-meta">${subParts.join(' · ')}</div>` : '';
    return `
    <div class="ent">
      <div class="ttl">${esc(p.name)}</div>
      ${subLine}
      <ul><li>${esc(p.description)}</li></ul>
    </div>
  `;
  }).join('\n');
}

function educationBlock(cv: GeneratedCV): string {
  return cv.education.map(ed => {
    const subParts = [esc(ed.school)];
    if (ed.dates) subParts.push(esc(ed.dates));
    return `
    <div class="ent">
      <div class="ttl">${esc(ed.degree)}</div>
      <div class="sub-meta">${subParts.join(' · ')}</div>
      ${ed.extras?.length ? ed.extras.map(x => `<div class="sub"><em>${esc(x)}</em></div>`).join('') : ''}
    </div>`;
  }).join('\n').replace(/\s+$/g, '');
}


export function renderCvHtml(cv: GeneratedCV): string {
  const certs = cv.certifications?.length
    ? `<div class="sec"><div class="st">Certifications</div><div class="sum">${esc(cv.certifications.join(' · '))}</div></div>`
    : '';

  const projects = cv.projects?.length
    ? `<div class="sec"><div class="st">Projects</div>${projectsBlock(cv)}</div>`
    : '';

  const competencies = cv.competencies?.length
    ? `<div class="sec"><div class="st">Core Competencies</div><div class="comp">${cv.competencies.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(cv.name)} — Resume</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0; }
  body {
    font-family: Calibri, Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    line-height: 1.18;
    color: #111;
    width: 8.5in;
    min-height: 11in;
    max-height: 11in;
    overflow: hidden;
    margin: 0 auto;
    padding: 0.3in 0.5in;
    background: #fff;
  }
  .hdr { text-align: center; border-bottom: 1.2pt solid #1a56db; padding-bottom: 4pt; margin-bottom: 5pt; }
  .hdr h1 { font-size: 16pt; font-weight: 700; letter-spacing: 0.3pt; margin-bottom: 2pt; }
  .hdr .tag { font-size: 9pt; color: #333; font-weight: 600; margin-bottom: 2pt; }
  .hdr .ct { font-size: 8.5pt; color: #444; }
  .hdr a { color: #1a56db; text-decoration: none; }
  .sep { margin: 0 3pt; color: #bbb; }
  .sec { margin-bottom: 4pt; }
  .st { font-size: 9pt; font-weight: 700; color: #1a56db; text-transform: uppercase; letter-spacing: 0.6pt; border-bottom: 0.5pt solid #ccc; padding-bottom: 1pt; margin-bottom: 2.5pt; }
  .ent { margin-bottom: 4pt; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  .ttl { font-weight: 700; font-size: 9.5pt; line-height: 1.2; }
  .sub-meta { font-size: 8.5pt; color: #555; font-style: italic; margin-bottom: 1pt; line-height: 1.15; }
  .sub-meta a { color: #1a56db; text-decoration: none; }
  .dt  { font-size: 8.5pt; color: #555; white-space: nowrap; }
  .sub { font-style: italic; font-size: 8.5pt; color: #555; }
  .sum { font-size: 9pt; line-height: 1.2; margin-bottom: 3pt; }
  ul { padding-left: 13pt; margin: 1pt 0; }
  li { margin-bottom: 0.5pt; font-size: 9pt; line-height: 1.2; }
  .ski p { margin-bottom: 1pt; font-size: 8.5pt; line-height: 1.15; }
  .ski strong { font-weight: 700; }
  .comp { display: flex; flex-wrap: wrap; gap: 3pt; margin-bottom: 2pt; }
  .tag { display: inline-block; padding: 0.5pt 5pt; background: #f3f4f6; color: #1a56db; border-radius: 3pt; font-size: 8.5pt; font-weight: 600; text-decoration: none; }
  @media print { .st { color: #000; border-bottom-color: #aaa; } a { color: #000; } }
</style>
</head>
<body>

<div class="hdr">
  <h1>${esc(cv.name)}</h1>
  <div class="tag">${esc(cv.headline)}</div>
  <div class="ct">${contactLine(cv)}</div>
</div>

<div class="sec">
  <div class="st">Summary</div>
  <div class="sum">${esc(cv.summary)}</div>
</div>

${competencies}

<div class="sec ski">
  <div class="st">Skills</div>
  ${skillsBlock(cv)}
</div>

<div class="sec">
  <div class="st">Experience</div>
  ${experienceBlock(cv)}
</div>

${projects}

<div class="sec">
  <div class="st">Education</div>
  ${educationBlock(cv)}
</div>

${certs}

</body>
</html>`;
}
