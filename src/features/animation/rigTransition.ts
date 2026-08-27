import { expressionFields, type Expression } from '@/features/avatar/geometry'

export type VisibleRigState = {
  expression: Expression
  eyeOffset: { x: number; y: number }
  stageOffset: { x: number; y: number }
  faceForwardAmount: number
}

const smoothstep = (value: number) => {
  const progress = Math.max(0, Math.min(1, value))
  return progress * progress * (3 - 2 * progress)
}

const nearestAngle = (target: number, from: number) => {
  let resolved = target
  while (resolved - from > 180) resolved -= 360
  while (resolved - from < -180) resolved += 360
  return resolved
}

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

/**
 * Blends every visible rig channel from the exact rendered state. At progress 0
 * every visible numeric channel equals the source pose, so changing animation
 * ownership cannot teleport the mascot before the first animation frame.
 */
export const blendVisibleRigState = (
  from: VisibleRigState,
  target: VisibleRigState,
  linearProgress: number
): VisibleRigState => {
  const progress = smoothstep(linearProgress)
  const resolvedTarget = {
    ...target.expression,
    headX: nearestAngle(target.expression.headX, from.expression.headX),
    headY: nearestAngle(target.expression.headY, from.expression.headY),
    headZ: nearestAngle(target.expression.headZ, from.expression.headZ),
    leftAngle: nearestAngle(target.expression.leftAngle, from.expression.leftAngle),
    rightAngle: nearestAngle(target.expression.rightAngle, from.expression.rightAngle),
  }
  const expression = { ...resolvedTarget }
  expressionFields.forEach(field => {
    expression[field] = mix(from.expression[field], resolvedTarget[field], progress)
  })
  return {
    expression,
    eyeOffset: {
      x: mix(from.eyeOffset.x, target.eyeOffset.x, progress),
      y: mix(from.eyeOffset.y, target.eyeOffset.y, progress),
    },
    stageOffset: {
      x: mix(from.stageOffset.x, target.stageOffset.x, progress),
      y: mix(from.stageOffset.y, target.stageOffset.y, progress),
    },
    faceForwardAmount: mix(from.faceForwardAmount, target.faceForwardAmount, progress),
  }
}
