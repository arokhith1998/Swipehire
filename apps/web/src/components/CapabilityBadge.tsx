/**
 * CapabilityBadge — shown on every job card so the user knows what'll happen
 * when they swipe right BEFORE they commit.
 *
 * Trust-through-transparency: the user is never surprised by what auto-apply
 * does or doesn't do for a given job.
 */

import type { ApplyCapability } from '@swipehire/shared';

interface Props {
  capability: ApplyCapability;
  size?: 'sm' | 'md';
}

const STYLES: Record<ApplyCapability, { label: string; emoji: string; bg: string; fg: string; tip: string }> = {
  tier1_server: {
    label: 'Auto-apply',
    emoji: '🤖',
    bg: '#E8F8F7',
    fg: '#00807E',
    tip: 'We submit this for you (Greenhouse / Lever / Ashby)',
  },
  tier2_assisted: {
    label: '1-click',
    emoji: '⚡',
    bg: '#FFF4E0',
    fg: '#B36800',
    tip: 'We pre-fill the form. You tap Submit.',
  },
  extension_universal: {
    label: 'Use extension',
    emoji: '🧩',
    bg: '#EEEFFE',
    fg: '#3D40C8',
    tip: 'Install the SwipeHire extension to auto-fill any career page',
  },
  manual_only: {
    label: 'Manual',
    emoji: '📝',
    bg: '#F2F2F2',
    fg: '#555',
    tip: 'We tailor your resume; you apply on their site',
  },
};

export function CapabilityBadge({ capability, size = 'sm' }: Props) {
  const s = STYLES[capability];
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${px}`}
      style={{ backgroundColor: s.bg, color: s.fg }}
      title={s.tip}
    >
      <span aria-hidden>{s.emoji}</span>
      {s.label}
    </span>
  );
}
