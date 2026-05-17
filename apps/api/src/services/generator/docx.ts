/**
 * Structured DOCX builders — programmatic via the `docx` package.
 *
 * Visually similar to the HTML/PDF (single column, ATS-safe) but Word-native
 * so candidates can edit before submitting.
 */
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  BorderStyle, ExternalHyperlink, Tab, TabStopType, TabStopPosition,
} from 'docx';
import type { GeneratedCV, GeneratedCoverLetter } from './types.js';

const ACCENT = '1A56DB';

function header(name: string, headline: string, contactParts: string[]): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: name, bold: true, size: 32 })],   // 32 half-pts = 16pt
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: headline, bold: true, size: 18, color: '333333' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: contactParts.join(' | '), size: 17, color: '444444' })],
      border: { bottom: { color: ACCENT, space: 1, style: BorderStyle.SINGLE, size: 8 } },
      spacing: { after: 120 },
    }),
  ];
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: ACCENT })],
    border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 4 } },
    spacing: { before: 120, after: 60 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 20 },
  });
}

function rightAlignedRow(left: string, right: string, leftBold = true): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { after: 0 },
    children: [
      new TextRun({ text: left, bold: leftBold, size: 19 }),
      new TextRun({ children: [new Tab(), right], size: 17, color: '555555' }),
    ],
  });
}

function contactPartsCV(cv: GeneratedCV): string[] {
  const p: string[] = [];
  if (cv.contact.location) p.push(cv.contact.location);
  if (cv.contact.phone) p.push(cv.contact.phone);
  if (cv.contact.email) p.push(cv.contact.email);
  if (cv.contact.linkedin) p.push(cv.contact.linkedin.replace(/^https?:\/\//, ''));
  if (cv.contact.portfolio) p.push(cv.contact.portfolio.replace(/^https?:\/\//, ''));
  return p;
}

export async function cvToDocx(cv: GeneratedCV): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(...header(cv.name, cv.headline, contactPartsCV(cv)));

  // Summary
  children.push(sectionTitle('Summary'));
  children.push(new Paragraph({ text: cv.summary, spacing: { after: 60 } }));

  // Core Competencies (placed between Summary and Skills per recruiter-scan order)
  if (cv.competencies?.length) {
    children.push(sectionTitle('Core Competencies'));
    children.push(new Paragraph({
      children: [new TextRun({ text: cv.competencies.join('  ·  '), size: 18, bold: true, color: ACCENT })],
      spacing: { after: 60 },
    }));
  }

  // Skills
  if (cv.skills.length > 0) {
    children.push(sectionTitle('Skills'));
    for (const s of cv.skills) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${s.category}: `, bold: true, size: 17 }),
          new TextRun({ text: s.items.join(', '), size: 17 }),
        ],
        spacing: { after: 10 },
      }));
    }
  }

  // Experience
  if (cv.experience.length > 0) {
    children.push(sectionTitle('Experience'));
    for (const e of cv.experience) {
      const titleLeft = `${e.title}, ${e.company}${e.location ? ` · ${e.location}` : ''}`;
      children.push(rightAlignedRow(titleLeft, e.dates));
      for (const b of e.bullets) children.push(bullet(b));
    }
  }

  // Projects
  if (cv.projects?.length > 0) {
    children.push(sectionTitle('Projects'));
    for (const p of cv.projects) {
      children.push(rightAlignedRow(p.name, p.dates ?? ''));
      children.push(bullet(p.description));
    }
  }

  // Education
  if (cv.education.length > 0) {
    children.push(sectionTitle('Education'));
    for (const ed of cv.education) {
      children.push(rightAlignedRow(ed.degree, ed.dates));
      children.push(new Paragraph({ children: [new TextRun({ text: ed.school, italics: true, size: 17, color: '555555' })], spacing: { after: 0 } }));
      if (ed.extras?.length) {
        for (const x of ed.extras) {
          children.push(new Paragraph({ children: [new TextRun({ text: x, italics: true, size: 17, color: '555555' })], spacing: { after: 0 } }));
        }
      }
    }
  }

  if (cv.certifications?.length) {
    children.push(sectionTitle('Certifications'));
    children.push(new Paragraph({ text: cv.certifications.join(' · '), spacing: { after: 0 } }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 19 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },                          // US Letter, 1/20pt
          margin: { top: 720, bottom: 720, left: 720, right: 720 },        // 0.5"
        },
      },
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

function contactPartsCL(cl: GeneratedCoverLetter): string[] {
  const p: string[] = [];
  if (cl.contact.location) p.push(cl.contact.location);
  if (cl.contact.phone) p.push(cl.contact.phone);
  if (cl.contact.email) p.push(cl.contact.email);
  if (cl.contact.linkedin) p.push(cl.contact.linkedin.replace(/^https?:\/\//, ''));
  if (cl.contact.portfolio) p.push(cl.contact.portfolio.replace(/^https?:\/\//, ''));
  return p;
}

/** Strip <p>...</p>, normalize <br>, return paragraphs of plain text + bold runs from <strong>. */
function htmlToParagraphs(html: string): Paragraph[] {
  // Split on </p> boundaries first, then strip <p ...>
  const blocks = html
    .replace(/\r\n/g, '\n')
    .split(/<\/p\s*>/i)
    .map(s => s.replace(/<p[^>]*>/i, '').trim())
    .filter(Boolean);

  return blocks.map(block => {
    // Tokenize <strong>...</strong> spans → bold TextRuns; everything else plain.
    const runs: TextRun[] = [];
    const pattern = /<(strong|b)\s*>(.*?)<\/\1>/gi;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(block)) !== null) {
      if (m.index > lastIdx) {
        runs.push(new TextRun({ text: stripTags(block.slice(lastIdx, m.index)), size: 21 }));
      }
      runs.push(new TextRun({ text: stripTags(m[2]), bold: true, size: 21 }));
      lastIdx = pattern.lastIndex;
    }
    if (lastIdx < block.length) {
      runs.push(new TextRun({ text: stripTags(block.slice(lastIdx)), size: 21 }));
    }
    return new Paragraph({ children: runs.length ? runs : [new TextRun({ text: stripTags(block), size: 21 })], spacing: { after: 180 } });
  });
}

function stripTags(s: string): string {
  return s.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&middot;/g, '·');
}

export async function coverLetterToDocx(cl: GeneratedCoverLetter): Promise<Buffer> {
  const children: Paragraph[] = [];
  // Header
  children.push(new Paragraph({
    children: [new TextRun({ text: cl.candidateName.toUpperCase(), bold: true, size: 34 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: contactPartsCL(cl).join(' · '), size: 19, color: '444444' })],
    border: { bottom: { color: ACCENT, space: 1, style: BorderStyle.SINGLE, size: 8 } },
    spacing: { after: 240 },
  }));
  // Meta
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'To: ', bold: true, size: 19 }),
      new TextRun({ text: `Hiring Team, ${cl.company}    ·    `, size: 19, color: '555555' }),
      new TextRun({ text: 'Role: ', bold: true, size: 19 }),
      new TextRun({ text: `${cl.role}    ·    `, size: 19, color: '555555' }),
      new TextRun({ text: 'Date: ', bold: true, size: 19 }),
      new TextRun({ text: cl.date, size: 19, color: '555555' }),
    ],
    spacing: { after: 240 },
  }));
  // Greeting
  children.push(new Paragraph({
    children: [new TextRun({ text: `Hiring Team, ${cl.company},`, bold: true, size: 21 })],
    spacing: { after: 180 },
  }));
  // Body
  children.push(...htmlToParagraphs(cl.bodyHtml));
  // Sign-off
  children.push(new Paragraph({ text: 'Looking forward to talking.', spacing: { after: 200 } }));
  children.push(new Paragraph({ children: [new TextRun({ text: cl.candidateName, bold: true, size: 21 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: contactPartsCL(cl).join(' · '), size: 19, color: '555555' })] }));

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 864, bottom: 864, left: 1008, right: 1008 },     // 0.6" / 0.7"
        },
      },
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
