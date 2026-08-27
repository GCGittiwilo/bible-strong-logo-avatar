import type { BodyMotion, Expression, EyeMotion } from './geometry'

export const eyeMotionModes = ['none', 'microSaccades', 'shake'] as const
export const bodyMotionModes = ['none', 'slowDrift', 'shake'] as const
export const gazeProfiles = [
  'calm',
  'attentive',
  'reflective',
  'scanning',
  'focused',
  'conversational',
  'celebratory',
  'alert',
  'orbit',
  'animation',
] as const
export type GazeProfile = (typeof gazeProfiles)[number]
export type CoordinatedGaze = {
  target: Readonly<{ x: number; y: number }>
  eyeOffset: Readonly<{ x: number; y: number }>
  headOffset: Readonly<{ x: number; y: number; z: number }>
  /** Rotation inside the eye socket, in degrees. */
  eyeSocket: Readonly<{ pitch: number; yaw: number }>
  /** Rotation at the neck, relative to the forward-facing torso. */
  neckOffset: Readonly<{ pitch: number; yaw: number; roll: number }>
  /** Small torso/root compensation. It never turns far enough to face away. */
  bodyOffset: Readonly<{ pitch: number; yaw: number; roll: number }>
  headBaseWeight: number
}
const eyeMotionSet = new Set<string>(eyeMotionModes)
const bodyMotionSet = new Set<string>(bodyMotionModes)
export const isEyeMotion = (value: unknown): value is EyeMotion =>
  typeof value === 'string' && eyeMotionSet.has(value)
export const isBodyMotion = (value: unknown): value is BodyMotion =>
  typeof value === 'string' && bodyMotionSet.has(value)

const smoothstep = (value: number) => value * value * (3 - 2 * value)
const hash = (value: number) => {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453
  return (raw - Math.floor(raw)) * 2 - 1
}

const expressionSeed = (expression: Expression) =>
  expression.headX * 0.71 + expression.headY * 1.13 + expression.headZ * 1.37
const EYE_MOTION_SEED = 17.29

const gazeWaypoints: Record<
  Exclude<GazeProfile, 'orbit' | 'animation'>,
  { intervalMs: number; points: readonly (readonly [number, number])[] }
> = {
  calm: {
    intervalMs: 2700,
    points: [
      [0, 0],
      [0.2, -0.08],
      [-0.16, 0.06],
      [0.08, 0.02],
    ],
  },
  attentive: {
    intervalMs: 2100,
    points: [
      [0, 0],
      [-0.38, -0.08],
      [0.42, -0.04],
      [0.12, 0.08],
    ],
  },
  reflective: {
    intervalMs: 2400,
    points: [
      [0, 0],
      [-0.76, -0.7],
      [0.44, -0.62],
      [-0.42, -0.35],
    ],
  },
  scanning: {
    intervalMs: 1550,
    points: [
      [0, 0],
      [-0.88, -0.2],
      [0.9, -0.12],
      [-0.7, 0.26],
      [0.78, 0.12],
    ],
  },
  focused: {
    intervalMs: 1900,
    points: [
      [0, 0],
      [-0.36, 0.18],
      [0.34, 0.14],
      [0.06, -0.12],
      [-0.22, 0.04],
    ],
  },
  conversational: {
    intervalMs: 1750,
    points: [
      [0, 0],
      [0, 0.08],
      [-0.48, -0.02],
      [0.45, -0.12],
      [0.18, 0.14],
    ],
  },
  celebratory: {
    intervalMs: 1300,
    points: [
      [0, 0],
      [0.72, -0.42],
      [-0.72, -0.4],
      [0, 0.22],
    ],
  },
  alert: {
    intervalMs: 1050,
    points: [
      [0, 0],
      [-0.84, -0.04],
      [0.84, -0.04],
      [0, -0.38],
      [0, 0.1],
    ],
  },
}

const interpolateWaypoint = (
  points: readonly (readonly [number, number])[],
  elapsedMs: number,
  intervalMs: number
) => {
  const progress = Math.max(0, elapsedMs) / intervalMs
  const step = Math.floor(progress)
  const blend = smoothstep(progress - step)
  const from = points[step % points.length]
  const to = points[(step + 1) % points.length]
  return {
    x: from[0] + (to[0] - from[0]) * blend,
    y: from[1] + (to[1] - from[1]) * blend,
  }
}

const gazeTargetAt = (profile: GazeProfile, elapsedMs: number) => {
  if (profile === 'orbit') {
    const angle = (Math.max(0, elapsedMs) / 3600) * Math.PI * 2 - Math.PI / 2
    return { x: Math.cos(angle) * 0.82, y: Math.sin(angle) * 0.5 }
  }
  const pattern = gazeWaypoints[profile === 'animation' ? 'attentive' : profile]
  return interpolateWaypoint(pattern.points, elapsedMs, pattern.intervalMs)
}

const clampDegrees = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

export const gazeRigLimits = {
  target: { yaw: 114, up: 82, down: 105 },
  eye: {
    yaw: 46,
    up: 32,
    down: 48,
    comfortYaw: 30,
    comfortUp: 22,
    comfortDown: 34,
  },
  neck: { yaw: 64, up: 45, down: 55 },
  body: { yaw: 8, up: 8, down: 8 },
} as const

const directionalLimit = (value: number, negativeLimit: number, positiveLimit: number) =>
  Math.max(-negativeLimit, Math.min(positiveLimit, value))

const distributeEyeAndFollow = (
  targetDegrees: number,
  comfortNegative: number,
  comfortPositive: number,
  eyeNegative: number,
  eyePositive: number
) => {
  const direction = Math.sign(targetDegrees)
  const magnitude = Math.abs(targetDegrees)
  const comfort = direction < 0 ? comfortNegative : comfortPositive
  const hardLimit = direction < 0 ? eyeNegative : eyePositive
  if (magnitude <= comfort) return { eye: targetDegrees, follow: 0 }

  // The eye keeps leading after the neck joins in, then settles at its socket limit.
  const eyeMagnitude = Math.min(hardLimit, comfort + (magnitude - comfort) * 0.32)
  const eye = direction * eyeMagnitude
  return { eye, follow: targetDegrees - eye }
}

const splitHeadAndBody = (
  followDegrees: number,
  neckNegative: number,
  neckPositive: number,
  bodyNegative: number,
  bodyPositive: number
) => {
  const neck = directionalLimit(followDegrees, neckNegative, neckPositive)
  return {
    neck,
    body: directionalLimit(followDegrees - neck, bodyNegative, bodyPositive),
  }
}

export const coordinatedGazeAt = (
  profile: GazeProfile,
  elapsedMs: number,
  strength = 1
): CoordinatedGaze =>
  solveGazeRig(
    gazeTargetAt(profile, elapsedMs),
    strength,
    profile === 'orbit' || profile === 'animation' ? 1 : 0.18
  )

/**
 * Resolves one authoritative gaze target through the anatomical rig. The head never
 * samples a separate animation clock. The eyes lead each look; the neck begins
 * following inside the socket's hard limit, and the forward-facing body only adds
 * the final few degrees needed for a large look.
 */
export const solveGazeRig = (
  target: Readonly<{ x: number; y: number }>,
  strength = 1,
  headBaseWeight = 0.18
): CoordinatedGaze => {
  const resolvedTarget = {
    x: Math.max(-1, Math.min(1, target.x)) * strength,
    y: Math.max(-1, Math.min(1, target.y)) * strength,
  }
  const targetYaw = resolvedTarget.x * gazeRigLimits.target.yaw
  const targetPitch =
    resolvedTarget.y < 0
      ? resolvedTarget.y * gazeRigLimits.target.up
      : resolvedTarget.y * gazeRigLimits.target.down
  const yaw = distributeEyeAndFollow(
    targetYaw,
    gazeRigLimits.eye.comfortYaw,
    gazeRigLimits.eye.comfortYaw,
    gazeRigLimits.eye.yaw,
    gazeRigLimits.eye.yaw
  )
  const pitch = distributeEyeAndFollow(
    targetPitch,
    gazeRigLimits.eye.comfortUp,
    gazeRigLimits.eye.comfortDown,
    gazeRigLimits.eye.up,
    gazeRigLimits.eye.down
  )
  const yawFollow = splitHeadAndBody(
    yaw.follow,
    gazeRigLimits.neck.yaw,
    gazeRigLimits.neck.yaw,
    gazeRigLimits.body.yaw,
    gazeRigLimits.body.yaw
  )
  const pitchFollow = splitHeadAndBody(
    pitch.follow,
    gazeRigLimits.neck.up,
    gazeRigLimits.neck.down,
    gazeRigLimits.body.up,
    gazeRigLimits.body.down
  )
  const neckYaw = yawFollow.neck
  const neckPitch = pitchFollow.neck
  const bodyYaw = yawFollow.body
  const bodyPitch = pitchFollow.body
  const visibleHeadYaw = neckYaw + bodyYaw
  const visibleHeadPitch = neckPitch + bodyPitch
  const eyeYaw = yaw.eye
  const eyePitch = pitch.eye
  const roll = clampDegrees(-visibleHeadYaw * 0.08, 4)
  return {
    target: resolvedTarget,
    eyeOffset: {
      x: (eyeYaw / gazeRigLimits.eye.yaw) * 22,
      y:
        eyePitch < 0
          ? (eyePitch / gazeRigLimits.eye.up) * 26
          : (eyePitch / gazeRigLimits.eye.down) * 34,
    },
    headOffset: {
      // Screen Y grows downward, while positive model-space X rotation visually
      // pitches the face upward. Convert the semantic gaze pitch at this boundary.
      x: -visibleHeadPitch,
      y: visibleHeadYaw,
      z: roll,
    },
    eyeSocket: { pitch: eyePitch, yaw: eyeYaw },
    neckOffset: { pitch: neckPitch, yaw: neckYaw, roll },
    bodyOffset: { pitch: bodyPitch, yaw: bodyYaw, roll: 0 },
    headBaseWeight,
  }
}

export const applyCoordinatedGaze = (
  expression: Expression,
  gaze: CoordinatedGaze
): Expression => ({
  ...expression,
  headX: expression.headX * gaze.headBaseWeight + gaze.headOffset.x,
  headY: expression.headY * gaze.headBaseWeight + gaze.headOffset.y,
  headZ: expression.headZ * gaze.headBaseWeight + gaze.headOffset.z,
})

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

export const blendCoordinatedGaze = (
  from: CoordinatedGaze,
  to: CoordinatedGaze,
  progress: number
): CoordinatedGaze => {
  const eased = smoothstep(Math.max(0, Math.min(1, progress)))
  return {
    target: {
      x: mix(from.target.x, to.target.x, eased),
      y: mix(from.target.y, to.target.y, eased),
    },
    eyeOffset: {
      x: mix(from.eyeOffset.x, to.eyeOffset.x, eased),
      y: mix(from.eyeOffset.y, to.eyeOffset.y, eased),
    },
    headOffset: {
      x: mix(from.headOffset.x, to.headOffset.x, eased),
      y: mix(from.headOffset.y, to.headOffset.y, eased),
      z: mix(from.headOffset.z, to.headOffset.z, eased),
    },
    eyeSocket: {
      pitch: mix(from.eyeSocket.pitch, to.eyeSocket.pitch, eased),
      yaw: mix(from.eyeSocket.yaw, to.eyeSocket.yaw, eased),
    },
    neckOffset: {
      pitch: mix(from.neckOffset.pitch, to.neckOffset.pitch, eased),
      yaw: mix(from.neckOffset.yaw, to.neckOffset.yaw, eased),
      roll: mix(from.neckOffset.roll, to.neckOffset.roll, eased),
    },
    bodyOffset: {
      pitch: mix(from.bodyOffset.pitch, to.bodyOffset.pitch, eased),
      yaw: mix(from.bodyOffset.yaw, to.bodyOffset.yaw, eased),
      roll: mix(from.bodyOffset.roll, to.bodyOffset.roll, eased),
    },
    headBaseWeight: mix(from.headBaseWeight, to.headBaseWeight, eased),
  }
}

const smoothNoise = (elapsedMs: number, axis: number, seed: number, interval: number) => {
  const progress = elapsedMs / interval
  const step = Math.floor(progress)
  const blend = smoothstep(progress - step)
  const previous = hash(step * 3 + axis + seed)
  const next = hash((step + 1) * 3 + axis + seed)
  return previous + (next - previous) * blend
}

const saccade = (elapsedMs: number, axis: number, seed: number) => {
  const interval = 1100
  const duration = 140
  if (elapsedMs <= 0) return 0
  const step = Math.floor(elapsedMs / interval)
  const progress = (elapsedMs - step * interval) / duration
  const blend = smoothstep(Math.min(progress, 1))
  const previous = step === 0 ? 0 : hash((step - 1) * 2 + axis + seed)
  const next = hash(step * 2 + axis + seed)
  return previous + (next - previous) * blend
}

export const hasAmbientMotion = (expression: Expression) =>
  expression.eyeMotion !== 'none' || expression.bodyMotion !== 'none'

export const ambientBodyOffset = (expression: Expression, elapsedMs: number, strength = 1) => {
  const seed = expressionSeed(expression)
  if (expression.bodyMotion === 'slowDrift') {
    return {
      x: smoothNoise(elapsedMs, 3, seed, 2900) * 1.45 * strength,
      y: smoothNoise(elapsedMs, 4, seed, 3700) * 1.1 * strength,
    }
  }
  if (expression.bodyMotion === 'shake') {
    const time = elapsedMs / 1000
    return {
      x: (Math.sin(time * 31) + Math.sin(time * 53) * 0.45) * 1.35 * strength,
      y: (Math.sin(time * 37) + Math.sin(time * 61) * 0.4) * 1.1 * strength,
    }
  }
  return { x: 0, y: 0 }
}

export const ambientEyeOffset = (expression: Expression, elapsedMs: number, strength = 1) => {
  if (expression.eyeMotion === 'microSaccades') {
    return {
      x: saccade(elapsedMs, 0, EYE_MOTION_SEED) * 1.5 * strength,
      y: saccade(elapsedMs, 1, EYE_MOTION_SEED) * 0.9 * strength,
    }
  }
  if (expression.eyeMotion === 'shake') {
    const time = elapsedMs / 1000
    return {
      x: (Math.sin(time * 47) + Math.sin(time * 71) * 0.45) * 1.2 * strength,
      y: (Math.sin(time * 59) + Math.sin(time * 83) * 0.4) * 0.8 * strength,
    }
  }
  return { x: 0, y: 0 }
}

export const applyAmbientBodyMotion = (
  expression: Expression,
  elapsedMs: number,
  strength = 1
): Expression => {
  const next = { ...expression }
  const seed = expressionSeed(expression)

  if (expression.bodyMotion === 'slowDrift') {
    next.headX += smoothNoise(elapsedMs, 0, seed, 2600) * 0.8 * strength
    next.headY += smoothNoise(elapsedMs, 1, seed, 3300) * 1.15 * strength
    next.headZ += smoothNoise(elapsedMs, 2, seed, 4100) * 0.45 * strength
  } else if (expression.bodyMotion === 'shake') {
    const time = elapsedMs / 1000
    next.headX += (Math.sin(time * 31) + Math.sin(time * 53) * 0.45) * 1.15 * strength
    next.headY += (Math.sin(time * 37) + Math.sin(time * 61) * 0.4) * 1.35 * strength
    next.headZ += Math.sin(time * 43) * 0.7 * strength
  }

  return next
}

export const applyAmbientMotion = (
  expression: Expression,
  elapsedMs: number,
  strength = 1
): Expression => {
  const next = applyAmbientBodyMotion(expression, elapsedMs, strength)
  const eyeOffset = ambientEyeOffset(expression, elapsedMs, strength)
  next.positionXLeft += eyeOffset.x
  next.positionXRight += eyeOffset.x
  next.positionYLeft += eyeOffset.y
  next.positionYRight += eyeOffset.y
  return next
}
