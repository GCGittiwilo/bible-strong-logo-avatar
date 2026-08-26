import { AudioLines, Captions, Check, Ear, Search, TriangleAlert, Wrench } from 'lucide-react'

import type { SequenceEffect } from '@/features/animation/sequences'

export function StatusEffectGlyph({ effect }: { effect: SequenceEffect }) {
  if (effect === 'thinking') {
    return (
      <g className="status-effect-inner status-effect-thinking">
        <rect className="status-effect-bubble" x="-21" y="-17" width="42" height="27" rx="13.5" />
        <circle className="status-effect-bubble" cx="19" cy="15" r="3.8" />
        <circle className="status-effect-bubble" cx="26" cy="22" r="2.3" />
        <circle className="status-effect-dot status-effect-dot-1" cx="-9" cy="-3.5" r="2" />
        <circle className="status-effect-dot status-effect-dot-2" cx="0" cy="-3.5" r="2" />
        <circle className="status-effect-dot status-effect-dot-3" cx="9" cy="-3.5" r="2" />
      </g>
    )
  }

  const Icon =
    effect === 'listening'
      ? Ear
      : effect === 'transcribing'
        ? Captions
        : effect === 'searching'
          ? Search
          : effect === 'working'
            ? Wrench
            : effect === 'speaking'
              ? AudioLines
              : effect === 'complete'
                ? Check
                : TriangleAlert

  return (
    <g className={`status-effect-inner status-effect-${effect}`}>
      <circle className="status-effect-badge" r="16.5" />
      <Icon
        className="status-effect-icon"
        x="-10"
        y="-10"
        width="20"
        height="20"
        strokeWidth="2.15"
      />
    </g>
  )
}
