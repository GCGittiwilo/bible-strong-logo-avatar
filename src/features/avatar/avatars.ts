import { parseAvatarBody, type AvatarBody } from './body'
import { defaultExpression, initialExpressions } from './presets'
import { surfacePresets } from './surfaces'
import type { Expression } from './geometry'
import { isBodyMotion, isEyeMotion } from './ambientMotion'
import { parseAvatarMouth, type AvatarMouth } from './mouth'
import {
  normalizeSequencesForExpressions,
  parseSequences,
  type AvatarSequence,
} from '../animation/sequences'

export type AvatarBehaviorLibrary = {
  expressions: Expression[]
  sequences: AvatarSequence[]
}

export type AvatarLogoMorph = {
  centerNodeIds: string[]
  primaryOpacity: number
}

export type StudioAvatar = {
  id: string
  name: string
  body: AvatarBody
  bodyRevision?: number
  behaviorRevision?: number
  mouthRevision?: number
  eyesRevision?: number
  introducedInRevision?: number
  colors: AvatarColors
  eyes: AvatarEyeDefaults
  mouth?: AvatarMouth
  logoMorph?: AvatarLogoMorph
  faceForward?: boolean
  spinAnimations?: boolean
  behavior?: AvatarBehaviorLibrary
}

export type AvatarColors = { body: string; eyes: string }
export type AvatarEyeDefaults = Pick<
  Expression,
  | 'widthLeft'
  | 'widthRight'
  | 'heightLeft'
  | 'heightRight'
  | 'spacing'
  | 'positionXLeft'
  | 'positionXRight'
  | 'positionYLeft'
  | 'positionYRight'
  | 'leftAngle'
  | 'rightAngle'
>
export const defaultAvatarColors: AvatarColors = { body: '#5b7fe5', eyes: '#111316' }
export const defaultAvatarEyes: AvatarEyeDefaults = {
  widthLeft: defaultExpression.widthLeft,
  widthRight: defaultExpression.widthRight,
  heightLeft: defaultExpression.heightLeft,
  heightRight: defaultExpression.heightRight,
  spacing: defaultExpression.spacing,
  positionXLeft: defaultExpression.positionXLeft,
  positionXRight: defaultExpression.positionXRight,
  positionYLeft: defaultExpression.positionYLeft,
  positionYRight: defaultExpression.positionYRight,
  leftAngle: defaultExpression.leftAngle,
  rightAngle: defaultExpression.rightAngle,
}
const hexColor = /^#[0-9a-f]{6}$/i
const parseColors = (value: unknown): AvatarColors => {
  const candidate = value as Partial<AvatarColors> | null
  return {
    body:
      typeof candidate?.body === 'string' && hexColor.test(candidate.body)
        ? candidate.body
        : defaultAvatarColors.body,
    eyes:
      typeof candidate?.eyes === 'string' && hexColor.test(candidate.eyes)
        ? candidate.eyes
        : defaultAvatarColors.eyes,
  }
}

const eyeDefaultFields = Object.keys(defaultAvatarEyes) as (keyof AvatarEyeDefaults)[]
export const parseAvatarEyeDefaults = (value: unknown): AvatarEyeDefaults => {
  const candidate = value as Partial<AvatarEyeDefaults> | null
  const parsed = { ...defaultAvatarEyes }
  eyeDefaultFields.forEach(field => {
    const stored = candidate?.[field]
    if (typeof stored === 'number' && Number.isFinite(stored)) parsed[field] = stored
  })
  return parsed
}

export const applyAvatarEyeDefaults = (
  expression: Expression,
  eyes: AvatarEyeDefaults = defaultAvatarEyes
): Expression => {
  const result = { ...expression }
  eyeDefaultFields.forEach(field => {
    result[field] = expression[field] + eyes[field] - defaultAvatarEyes[field]
  })
  result.widthLeft = Math.max(10, result.widthLeft)
  result.widthRight = Math.max(10, result.widthRight)
  result.heightLeft = Math.max(10, result.heightLeft)
  result.heightRight = Math.max(10, result.heightRight)
  return result
}

export type AvatarLibrary = {
  activeAvatarId: string
  avatars: StudioAvatar[]
  bundledAvatarRevision?: number
}

const nonNegativeInteger = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0

const parseAvatarLogoMorph = (value: unknown, body: AvatarBody): AvatarLogoMorph | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AvatarLogoMorph>
  const availableNodeIds = new Set(body.nodes.map(node => node.id))
  const centerNodeIds = Array.isArray(candidate.centerNodeIds)
    ? [...new Set(candidate.centerNodeIds)].filter(
        (id): id is string => typeof id === 'string' && availableNodeIds.has(id)
      )
    : []
  if (!centerNodeIds.length) return undefined
  const primaryOpacity =
    typeof candidate.primaryOpacity === 'number' && Number.isFinite(candidate.primaryOpacity)
      ? Math.max(0, Math.min(1, candidate.primaryOpacity))
      : 1
  return { centerNodeIds, primaryOpacity }
}

const cloneExpressions = (expressions: Expression[]) => expressions.map(item => ({ ...item }))
export const parseExpressions = (value: unknown): Expression[] => {
  if (!Array.isArray(value) || !value.length) return cloneExpressions(initialExpressions)
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { ...defaultExpression, id: `expression-${String(index).padStart(2, '0')}` }
    }
    const candidate = item as Partial<Expression>
    const storedEyeMotion = (item as { eyeMotion?: unknown }).eyeMotion
    const storedBodyMotion = (item as { bodyMotion?: unknown }).bodyMotion
    const parsed = Object.fromEntries(
      Object.entries(defaultExpression).map(([field, fallback]) => {
        if (field === 'id') {
          return [
            field,
            typeof candidate.id === 'string' && candidate.id
              ? candidate.id
              : `expression-${String(index).padStart(2, '0')}`,
          ]
        }
        const stored = candidate[field as keyof Expression]
        return [field, typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback]
      })
    ) as Expression
    if (typeof candidate.bodyColor === 'string' && hexColor.test(candidate.bodyColor))
      parsed.bodyColor = candidate.bodyColor
    if (typeof candidate.eyeColor === 'string' && hexColor.test(candidate.eyeColor))
      parsed.eyeColor = candidate.eyeColor
    parsed.eyeMotion = isEyeMotion(storedEyeMotion) ? storedEyeMotion : defaultExpression.eyeMotion
    parsed.bodyMotion = isBodyMotion(storedBodyMotion)
      ? storedBodyMotion
      : defaultExpression.bodyMotion
    return parsed
  })
}

const cloneSequences = (sequences: AvatarSequence[]) =>
  sequences.map(sequence => ({
    ...sequence,
    steps: sequence.steps.map(step => ({ ...step })),
    blink: { ...sequence.blink },
  }))

export const cloneAvatarBehavior = (behavior: AvatarBehaviorLibrary): AvatarBehaviorLibrary => ({
  expressions: cloneExpressions(behavior.expressions),
  sequences: cloneSequences(behavior.sequences),
})

const spinExpression = (id: string, headX: number, headY: number, headZ: number): Expression => ({
  ...defaultExpression,
  id,
  headX,
  headY,
  headZ,
  eyeMotion: 'microSaccades',
  bodyMotion: 'none',
})

const spinExpressions = [
  spinExpression('logo-spin-rest', 0, 0, 0),
  ...[90, 180, 270].flatMap(angle => [
    spinExpression(`logo-spin-x-${angle}`, angle, 0, 0),
    spinExpression(`logo-spin-y-${angle}`, 0, angle, 0),
    spinExpression(`logo-spin-z-${angle}`, 0, 0, angle),
  ]),
  spinExpression('logo-spin-diagonal-1', 48, 52, 20),
  spinExpression('logo-spin-diagonal-2', -52, 128, 62),
  spinExpression('logo-spin-diagonal-3', 44, 214, 138),
  spinExpression('logo-spin-diagonal-4', -36, 302, 242),
  spinExpression('logo-spin-gyro-1', 34, 38, 16),
  spinExpression('logo-spin-gyro-2', -48, 112, 78),
  spinExpression('logo-spin-gyro-3', 62, 202, 158),
  spinExpression('logo-spin-gyro-4', -42, 292, 262),
]

const spinBlink = {
  enabled: true,
  initialDelayMs: 1400,
  minIntervalMs: 2400,
  maxIntervalMs: 4200,
  durationMs: 220,
}

const spinSequence = (
  id: string,
  name: string,
  expressionIds: string[],
  group: 'Face Locked Spins' | 'Face Attached Spins' | 'Loading',
  faceMode: AvatarSequence['faceMode'],
  options: {
    presentation?: AvatarSequence['presentation']
    transitionMs?: number
    transition?: AvatarSequence['steps'][number]['transition']
  } = {}
): AvatarSequence => ({
  id,
  name,
  group,
  description:
    group === 'Face Attached Spins'
      ? 'The eyes rotate with the logo frame as one connected character.'
      : group === 'Face Locked Spins'
        ? 'The logo frame spins independently while the eyes keep facing the user.'
        : 'The intact Bible Strong logo spins while the chatbot is loading.',
  builtIn: true,
  presentation: options.presentation ?? 'face',
  faceMode,
  ...(group === 'Loading' ? {} : { gazeProfile: 'orbit' as const }),
  playbackMode: 'loop',
  steps: expressionIds.map((expressionId, index) => ({
    id: `${id}-step-${index}`,
    expressionId,
    holdMs: options.transition === 'snappy' ? 140 : 90,
    transitionMs: options.transitionMs ?? 420,
    transition: options.transition ?? 'smooth',
  })),
  blink: { ...spinBlink },
})

const axisSequence = (axis: 'x' | 'y' | 'z') => [
  'logo-spin-rest',
  ...[90, 180, 270].map(angle => `logo-spin-${axis}-${angle}`),
]
const diagonalSequence = [
  'logo-spin-rest',
  'logo-spin-diagonal-1',
  'logo-spin-diagonal-2',
  'logo-spin-diagonal-3',
  'logo-spin-diagonal-4',
]
const gyroscopeSequence = [
  'logo-spin-rest',
  'logo-spin-gyro-1',
  'logo-spin-gyro-2',
  'logo-spin-gyro-3',
  'logo-spin-gyro-4',
]

const spinFamily = (
  prefix: 'face-locked' | 'face-attached',
  group: 'Face Locked Spins' | 'Face Attached Spins',
  faceMode: NonNullable<AvatarSequence['faceMode']>
) => [
  spinSequence(`${prefix}-horizontal-360`, 'Horizontal 360', axisSequence('y'), group, faceMode, {
    transitionMs: 360,
  }),
  spinSequence(`${prefix}-vertical-360`, 'Vertical 360', axisSequence('x'), group, faceMode, {
    transitionMs: 360,
  }),
  spinSequence(`${prefix}-roll-360`, 'Roll 360', axisSequence('z'), group, faceMode, {
    transitionMs: 340,
  }),
  spinSequence(`${prefix}-diagonal-orbit`, 'Diagonal Orbit', diagonalSequence, group, faceMode, {
    transitionMs: 390,
  }),
  spinSequence(`${prefix}-gyroscope`, 'Gyroscope', gyroscopeSequence, group, faceMode, {
    transitionMs: 320,
    transition: 'snappy',
  }),
]

const spinSequences = [
  ...spinFamily('face-locked', 'Face Locked Spins', 'locked'),
  ...spinFamily('face-attached', 'Face Attached Spins', 'attached'),
  spinSequence('loading', 'loading', axisSequence('y'), 'Loading', 'locked', {
    presentation: 'logo',
    transitionMs: 360,
  }),
]

export const resolveAvatarBehavior = (
  avatar: StudioAvatar,
  base: AvatarBehaviorLibrary
): AvatarBehaviorLibrary => {
  const source = avatar.behavior ?? base
  if (!avatar.spinAnimations) return source
  const spinExpressionIds = new Set(spinExpressions.map(expression => expression.id))
  const spinSequenceIds = new Set(spinSequences.map(sequence => sequence.id))
  return {
    expressions: [
      ...source.expressions.filter(expression => !spinExpressionIds.has(expression.id)),
      ...cloneExpressions(spinExpressions),
    ],
    sequences: [
      ...source.sequences.filter(sequence => !spinSequenceIds.has(sequence.id)),
      ...cloneSequences(spinSequences),
    ],
  }
}

const parseAvatarBehavior = (
  value: unknown,
  base: AvatarBehaviorLibrary
): AvatarBehaviorLibrary | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AvatarBehaviorLibrary>
  if (!Array.isArray(candidate.expressions) || !candidate.expressions.length) return undefined
  const expressions = parseExpressions(candidate.expressions)
  const sequences = normalizeSequencesForExpressions(
    Array.isArray(candidate.sequences)
      ? parseSequences(candidate.sequences)
      : cloneSequences(base.sequences),
    expressions
  )
  return { expressions, sequences }
}

export const createAvatar = (name: string): StudioAvatar => ({
  id: `avatar-${crypto.randomUUID()}`,
  name: name.trim() || 'Nouvel avatar',
  body: { primary: { ...surfacePresets.sphere }, nodes: [] },
  colors: { ...defaultAvatarColors },
  eyes: { ...defaultAvatarEyes },
})

export const parseAvatarLibrary = (
  value: unknown,
  fallback: AvatarLibrary,
  baseBehavior: AvatarBehaviorLibrary
): AvatarLibrary => {
  try {
    const parsed = value as Partial<AvatarLibrary> | null
    if (!parsed || !Array.isArray(parsed.avatars) || !parsed.avatars.length) return fallback
    const seenIds = new Set<string>()
    const storedBundledAvatarRevision = nonNegativeInteger(parsed.bundledAvatarRevision)
    const fallbackBundledAvatarRevision = fallback.bundledAvatarRevision ?? 0
    const bundledUpgrade = fallbackBundledAvatarRevision > storedBundledAvatarRevision
    const bundledAvatarIds = new Set(fallback.avatars.map(avatar => avatar.id))
    const parsedAvatars = parsed.avatars
      .filter(
        avatar =>
          !bundledUpgrade ||
          (avatar && typeof avatar.id === 'string' && bundledAvatarIds.has(avatar.id))
      )
      .filter(avatar => {
        if (!avatar || typeof avatar.id !== 'string' || typeof avatar.name !== 'string')
          return false
        if (seenIds.has(avatar.id)) return false
        seenIds.add(avatar.id)
        return true
      })
      .map(avatar => {
        const fallbackAvatar = fallback.avatars.find(item => item.id === avatar.id)
        const storedBehaviorRevision = nonNegativeInteger(avatar.behaviorRevision)
        const fallbackBehaviorRevision = fallbackAvatar?.behaviorRevision ?? 0
        const useFallbackBehavior = fallbackBehaviorRevision > storedBehaviorRevision
        const behavior = parseAvatarBehavior(
          useFallbackBehavior ? fallbackAvatar?.behavior : avatar.behavior,
          baseBehavior
        )
        const behaviorRevision = Math.max(storedBehaviorRevision, fallbackBehaviorRevision)
        const storedMouthRevision = nonNegativeInteger(avatar.mouthRevision)
        const fallbackMouthRevision = fallbackAvatar?.mouthRevision ?? 0
        const useFallbackMouth = fallbackMouthRevision > storedMouthRevision
        const mouth = useFallbackMouth
          ? parseAvatarMouth(fallbackAvatar?.mouth)
          : (parseAvatarMouth(avatar.mouth) ?? fallbackAvatar?.mouth)
        const mouthRevision = Math.max(storedMouthRevision, fallbackMouthRevision)
        const storedEyesRevision = nonNegativeInteger(avatar.eyesRevision)
        const fallbackEyesRevision = fallbackAvatar?.eyesRevision ?? 0
        const useFallbackEyes = fallbackEyesRevision > storedEyesRevision
        const eyes = parseAvatarEyeDefaults(useFallbackEyes ? fallbackAvatar?.eyes : avatar.eyes)
        const eyesRevision = Math.max(storedEyesRevision, fallbackEyesRevision)
        const storedBodyRevision = nonNegativeInteger(avatar.bodyRevision)
        const fallbackBodyRevision = fallbackAvatar?.bodyRevision ?? 0
        const useFallbackBody = fallbackBodyRevision > storedBodyRevision
        const body = parseAvatarBody(
          useFallbackBody ? fallbackAvatar?.body : avatar.body,
          surfacePresets.sphere
        )
        const bodyRevision = Math.max(storedBodyRevision, fallbackBodyRevision)
        const introducedInRevision = Math.max(
          nonNegativeInteger(avatar.introducedInRevision),
          fallbackAvatar?.introducedInRevision ?? 0
        )
        const logoMorph =
          parseAvatarLogoMorph(avatar.logoMorph, body) ??
          parseAvatarLogoMorph(fallbackAvatar?.logoMorph, body)
        return {
          id: avatar.id,
          name: avatar.name,
          body,
          ...(bodyRevision ? { bodyRevision } : {}),
          ...(behaviorRevision ? { behaviorRevision } : {}),
          ...(mouthRevision ? { mouthRevision } : {}),
          ...(eyesRevision ? { eyesRevision } : {}),
          ...(introducedInRevision ? { introducedInRevision } : {}),
          colors: parseColors(avatar.colors),
          eyes,
          ...(mouth ? { mouth } : {}),
          ...(logoMorph ? { logoMorph } : {}),
          ...((avatar.faceForward ?? fallbackAvatar?.faceForward) ? { faceForward: true } : {}),
          ...((avatar.spinAnimations ?? fallbackAvatar?.spinAnimations)
            ? { spinAnimations: true }
            : {}),
          ...(behavior ? { behavior } : {}),
        }
      })
    const installedAvatars = fallback.avatars.filter(
      avatar =>
        (avatar.introducedInRevision ?? 0) > storedBundledAvatarRevision &&
        !parsedAvatars.some(parsedAvatar => parsedAvatar.id === avatar.id)
    )
    const avatars = [...parsedAvatars, ...installedAvatars.map(avatar => structuredClone(avatar))]
    if (!avatars.length) return fallback
    const activeAvatarId = installedAvatars.length
      ? installedAvatars[installedAvatars.length - 1].id
      : avatars.some(avatar => avatar.id === parsed.activeAvatarId)
        ? parsed.activeAvatarId!
        : avatars[0].id
    const bundledAvatarRevision = Math.max(
      storedBundledAvatarRevision,
      fallbackBundledAvatarRevision
    )
    return {
      activeAvatarId,
      avatars,
      ...(bundledAvatarRevision ? { bundledAvatarRevision } : {}),
    }
  } catch {
    return fallback
  }
}
