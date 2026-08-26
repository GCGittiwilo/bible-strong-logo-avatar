export type AvatarMouth = {
  style: 'comic' | 'polished'
  positionX: number
  positionY: number
  width: number
  height: number
  color: string
  tongueColor: string
}

export type ComicMouthPose = {
  openness: number
  widthScale: number
  tilt: number
  offsetX: number
  offsetY: number
  wobble: number
  tongue: number
}

export const idleComicMouthPose: ComicMouthPose = {
  openness: 0.08,
  widthScale: 0.78,
  tilt: -2,
  offsetX: 0,
  offsetY: 0,
  wobble: 0,
  tongue: 0,
}

export const reducedMotionTalkingMouthPose: ComicMouthPose = {
  openness: 0.56,
  widthScale: 0.9,
  tilt: 3,
  offsetX: 0,
  offsetY: 1,
  wobble: 0.12,
  tongue: 0.4,
}

export const reducedMotionThinkingMouthPose: ComicMouthPose = {
  openness: 0.04,
  widthScale: 0.58,
  tilt: -7,
  offsetX: 3,
  offsetY: 0,
  wobble: 0.08,
  tongue: 0,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Produces a lively, deliberately non-phonetic speech rhythm. The mixed frequencies make the
 * mouth feel hand-animated while remaining deterministic and cheap enough for every frame.
 */
export const comicTalkingMouthPoseAt = (
  elapsedMs: number,
  reducedMotion = false
): ComicMouthPose => {
  if (reducedMotion) return reducedMotionTalkingMouthPose
  const seconds = Math.max(0, elapsedMs) / 1000
  const syllable = 0.5 + Math.sin(seconds * Math.PI * 10.4) * 0.38
  const chatter = Math.sin(seconds * Math.PI * 16.8 + 0.9) * 0.12
  const phrase = 0.82 + Math.sin(seconds * Math.PI * 1.35 + 0.4) * 0.18
  const openness = clamp01(0.12 + (syllable + chatter) * phrase * 0.78)

  return {
    openness,
    widthScale: 1.08 - openness * 0.3 + Math.sin(seconds * Math.PI * 5.2 + 1.1) * 0.08,
    tilt: Math.sin(seconds * Math.PI * 2.4) * 7,
    offsetX: Math.sin(seconds * Math.PI * 3.1 + 0.6) * 1.4,
    offsetY: Math.sin(seconds * Math.PI * 5.2 + 2.2) * 2.2,
    wobble: Math.sin(seconds * Math.PI * 6.6 + 1.7) * 0.2,
    tongue: clamp01((openness - 0.38) / 0.55),
  }
}

/** A slow side-to-side “hmm” mouth used while an assistant is preparing a response. */
export const comicThinkingMouthPoseAt = (
  elapsedMs: number,
  reducedMotion = false
): ComicMouthPose => {
  if (reducedMotion) return reducedMotionThinkingMouthPose
  const seconds = Math.max(0, elapsedMs) / 1000
  const ponder = Math.sin(seconds * Math.PI * 1.7)
  const purse = 0.5 + Math.sin(seconds * Math.PI * 2.3 + 0.8) * 0.5
  return {
    openness: 0.025 + purse * 0.055,
    widthScale: 0.54 + purse * 0.13,
    tilt: -6 + ponder * 7,
    offsetX: 2.5 + ponder * 3,
    offsetY: Math.sin(seconds * Math.PI * 1.1 + 1.4) * 1.2,
    wobble: ponder * 0.12,
    tongue: 0,
  }
}

const hexColor = /^#[0-9a-f]{6}$/i
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const parseAvatarMouth = (value: unknown): AvatarMouth | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AvatarMouth>
  if (
    (candidate.style !== 'comic' && candidate.style !== 'polished') ||
    !finite(candidate.positionX) ||
    !finite(candidate.positionY) ||
    !finite(candidate.width) ||
    !finite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0 ||
    typeof candidate.color !== 'string' ||
    !hexColor.test(candidate.color) ||
    typeof candidate.tongueColor !== 'string' ||
    !hexColor.test(candidate.tongueColor)
  ) {
    return undefined
  }
  return {
    style: candidate.style,
    positionX: candidate.positionX,
    positionY: candidate.positionY,
    width: candidate.width,
    height: candidate.height,
    color: candidate.color,
    tongueColor: candidate.tongueColor,
  }
}
