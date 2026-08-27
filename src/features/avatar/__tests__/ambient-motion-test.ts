import {
  ambientBodyOffset,
  ambientEyeOffset,
  applyAmbientBodyMotion,
  applyAmbientMotion,
  applyCoordinatedGaze,
  coordinatedGazeAt,
  gazeRigLimits,
  gazeProfiles,
  hasAmbientMotion,
  solveGazeRig,
} from '@/features/avatar/ambientMotion'
import { poseFromExpression, renderAvatar } from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import { surfacePresets } from '@/features/avatar/surfaces'

describe('perpetual expression motion', () => {
  it('leaves a motionless expression unchanged', () => {
    const expression = { ...defaultExpression }

    expect(hasAmbientMotion(expression)).toBe(false)
    expect(applyAmbientMotion(expression, 500)).toEqual(expression)
  })

  it('moves both eyes together without mutating the saved expression', () => {
    const expression = { ...defaultExpression, eyeMotion: 'microSaccades' as const }
    const animated = applyAmbientMotion(expression, 500)

    expect(animated.positionXLeft - expression.positionXLeft).toBeCloseTo(
      animated.positionXRight - expression.positionXRight
    )
    expect(animated.positionYLeft - expression.positionYLeft).toBeCloseTo(
      animated.positionYRight - expression.positionYRight
    )
    expect(animated.positionXLeft).not.toBe(expression.positionXLeft)
    expect(expression.positionXLeft).toBe(defaultExpression.positionXLeft)
  })

  it('fades into the first micro-adjustment immediately, then holds the new target', () => {
    const expression = { ...defaultExpression, eyeMotion: 'microSaccades' as const }
    const halfway = ambientEyeOffset(expression, 70)
    const target = ambientEyeOffset(expression, 200)

    expect(ambientEyeOffset(expression, 0)).toEqual({ x: 0, y: 0 })
    expect(halfway).not.toEqual({ x: 0, y: 0 })
    expect(halfway).not.toEqual(target)
    expect(target).toEqual(ambientEyeOffset(expression, 1000))
  })

  it('keeps eye micro-adjustments separate from the transitioning expression', () => {
    const expression = { ...defaultExpression, eyeMotion: 'microSaccades' as const }
    const transitioning = { ...expression, headX: 42, headY: -18, headZ: 71 }

    expect(applyAmbientBodyMotion(expression, 500)).toEqual(expression)
    expect(ambientEyeOffset(expression, 500)).not.toEqual({ x: 0, y: 0 })
    expect(ambientEyeOffset(transitioning, 500)).toEqual(ambientEyeOffset(expression, 500))
  })

  it('applies the eye offset as a render layer without moving the head', () => {
    const pose = poseFromExpression(defaultExpression)
    const base = renderAvatar(pose, surfacePresets.sphere, 1)
    const adjusted = renderAvatar(pose, surfacePresets.sphere, 1, {
      eyeOffset: { x: 1.5, y: -0.75 },
    })

    expect(adjusted.headPath).toBe(base.headPath)
    expect(adjusted.leftPath).not.toBe(base.leftPath)
    expect(adjusted.rightPath).not.toBe(base.rightPath)
  })

  it('adds body motion without changing eye placement', () => {
    const expression = { ...defaultExpression, bodyMotion: 'shake' as const }
    const animated = applyAmbientMotion(expression, 500)

    expect(animated.headY).not.toBe(expression.headY)
    expect(animated.positionXLeft).toBe(expression.positionXLeft)
    expect(animated.positionYRight).toBe(expression.positionYRight)
  })

  it('visibly offsets a symmetric body when it shakes', () => {
    const expression = { ...defaultExpression, bodyMotion: 'shake' as const }

    expect(ambientBodyOffset(expression, 500)).not.toEqual({ x: 0, y: 0 })
  })

  it('ramps perpetual motion with transition strength', () => {
    const expression = {
      ...defaultExpression,
      eyeMotion: 'shake' as const,
      bodyMotion: 'shake' as const,
    }
    const fullBodyOffset = ambientBodyOffset(expression, 500)
    const halfBodyOffset = ambientBodyOffset(expression, 500, 0.5)
    const fullEyeOffset = ambientEyeOffset(expression, 500)
    const halfEyeOffset = ambientEyeOffset(expression, 500, 0.5)

    expect(ambientBodyOffset(expression, 500, 0).x).toBeCloseTo(0)
    expect(ambientBodyOffset(expression, 500, 0).y).toBeCloseTo(0)
    expect(ambientEyeOffset(expression, 500, 0).x).toBeCloseTo(0)
    expect(ambientEyeOffset(expression, 500, 0).y).toBeCloseTo(0)
    expect(halfBodyOffset.x).toBeCloseTo(fullBodyOffset.x / 2)
    expect(halfBodyOffset.y).toBeCloseTo(fullBodyOffset.y / 2)
    expect(halfEyeOffset.x).toBeCloseTo(fullEyeOffset.x / 2)
    expect(halfEyeOffset.y).toBeCloseTo(fullEyeOffset.y / 2)
  })

  it('visibly offsets a symmetric body during slow drift', () => {
    const expression = { ...defaultExpression, bodyMotion: 'slowDrift' as const }

    expect(ambientBodyOffset(expression, 1500)).not.toEqual({ x: 0, y: 0 })
  })

  it('keeps small glances eye-only and lets the head follow larger gaze targets', () => {
    const smallGlance = coordinatedGazeAt('calm', 2700)
    const largeGlance = coordinatedGazeAt('scanning', 1700)

    expect(Math.abs(smallGlance.eyeOffset.x)).toBeGreaterThan(0)
    expect(smallGlance.headOffset.y).toBeCloseTo(0)
    expect(Math.abs(largeGlance.eyeOffset.x)).toBeGreaterThan(4)
    expect(Math.abs(largeGlance.headOffset.y)).toBeGreaterThan(2)
  })

  it('derives the head from the same authoritative eye target', () => {
    const eyeOnly = solveGazeRig({ x: 0.2, y: -0.12 })
    const eyeAndHead = solveGazeRig({ x: 0.82, y: -0.64 })
    const animated = applyCoordinatedGaze(defaultExpression, eyeAndHead)

    expect(eyeOnly.eyeOffset.x).not.toBeCloseTo(0)
    expect(eyeOnly.headOffset.y).toBeCloseTo(0)
    expect(animated.headY).not.toBeCloseTo(defaultExpression.headY)
    expect(Math.sign(animated.headY)).toBe(Math.sign(eyeAndHead.eyeSocket.yaw))
    expect(Math.sign(animated.headX)).toBe(-Math.sign(eyeAndHead.eyeSocket.pitch))
  })

  it('resolves large looks through socket, neck, and forward-facing body limits', () => {
    const gaze = coordinatedGazeAt('scanning', 1700)

    expect(Math.abs(gaze.eyeSocket.yaw)).toBeLessThanOrEqual(gazeRigLimits.eye.yaw)
    expect(gaze.eyeSocket.pitch).toBeGreaterThanOrEqual(-gazeRigLimits.eye.up)
    expect(gaze.eyeSocket.pitch).toBeLessThanOrEqual(gazeRigLimits.eye.down)
    expect(Math.abs(gaze.neckOffset.yaw)).toBeLessThanOrEqual(gazeRigLimits.neck.yaw)
    expect(gaze.neckOffset.pitch).toBeGreaterThanOrEqual(-gazeRigLimits.neck.up)
    expect(gaze.neckOffset.pitch).toBeLessThanOrEqual(gazeRigLimits.neck.down)
    expect(Math.abs(gaze.bodyOffset.yaw)).toBeLessThanOrEqual(gazeRigLimits.body.yaw)
    expect(gaze.bodyOffset.pitch).toBeGreaterThanOrEqual(-gazeRigLimits.body.up)
    expect(gaze.bodyOffset.pitch).toBeLessThanOrEqual(gazeRigLimits.body.down)
    expect(Math.sign(gaze.eyeSocket.yaw)).toBe(Math.sign(gaze.neckOffset.yaw))
  })

  it('starts the head before the eyes reach their socket limit', () => {
    const comfortable = solveGazeRig({ x: 0.2, y: -0.2 })
    const approachingEdge = solveGazeRig({ x: 0.42, y: -0.42 })

    expect(comfortable.headOffset.y).toBeCloseTo(0)
    expect(comfortable.headOffset.x).toBeCloseTo(0)
    expect(Math.abs(approachingEdge.eyeSocket.yaw)).toBeLessThan(gazeRigLimits.eye.yaw)
    expect(Math.abs(approachingEdge.eyeSocket.pitch)).toBeLessThan(gazeRigLimits.eye.up)
    expect(Math.abs(approachingEdge.headOffset.y)).toBeGreaterThan(0)
    expect(Math.abs(approachingEdge.headOffset.x)).toBeGreaterThan(0)
  })

  it('supports wider, asymmetric human-inspired vertical and side gaze', () => {
    const up = solveGazeRig({ x: 0, y: -1 })
    const down = solveGazeRig({ x: 0, y: 1 })
    const side = solveGazeRig({ x: 1, y: 0 })

    expect(up.eyeSocket.pitch).toBeCloseTo(-gazeRigLimits.eye.up)
    expect(up.neckOffset.pitch).toBeCloseTo(-gazeRigLimits.neck.up)
    expect(down.eyeSocket.pitch).toBeCloseTo(gazeRigLimits.eye.down)
    expect(down.neckOffset.pitch).toBeCloseTo(gazeRigLimits.neck.down)
    expect(side.eyeSocket.yaw).toBeCloseTo(gazeRigLimits.eye.yaw)
    expect(side.neckOffset.yaw).toBeCloseTo(gazeRigLimits.neck.yaw)
    expect(Math.abs(side.headOffset.y)).toBeGreaterThan(64)
    expect(Math.abs(side.headOffset.y)).toBeLessThanOrEqual(72)
  })

  it('converts vertical gaze into the renderer pitch direction without reversing the look', () => {
    const up = solveGazeRig({ x: 0, y: -1 })
    const down = solveGazeRig({ x: 0, y: 1 })
    const renderedUp = applyCoordinatedGaze(defaultExpression, up)
    const renderedDown = applyCoordinatedGaze(defaultExpression, down)

    expect(up.eyeOffset.y).toBeLessThan(0)
    expect(up.eyeSocket.pitch).toBeLessThan(0)
    expect(renderedUp.headX).toBeGreaterThan(0)
    expect(down.eyeOffset.y).toBeGreaterThan(0)
    expect(down.eyeSocket.pitch).toBeGreaterThan(0)
    expect(renderedDown.headX).toBeLessThan(0)
  })

  it('keeps every automated head direction linked to its current eye direction', () => {
    gazeProfiles.forEach(profile => {
      for (let elapsedMs = 0; elapsedMs <= 6000; elapsedMs += 120) {
        const gaze = coordinatedGazeAt(profile, elapsedMs)
        if (Math.abs(gaze.neckOffset.yaw) > 0.001) {
          expect(Math.sign(gaze.neckOffset.yaw)).toBe(Math.sign(gaze.eyeSocket.yaw))
        }
        if (Math.abs(gaze.neckOffset.pitch) > 0.001) {
          expect(Math.sign(gaze.neckOffset.pitch)).toBe(Math.sign(gaze.eyeSocket.pitch))
        }
      }
    })
  })

  it('makes chat gaze lead the head instead of preserving unrelated expression rotation', () => {
    const expression = { ...defaultExpression, headX: 30, headY: -40, headZ: 20 }
    const gaze = coordinatedGazeAt('attentive', 0)
    const animated = applyCoordinatedGaze(expression, gaze)

    expect(animated.headX).toBeCloseTo(5.4)
    expect(animated.headY).toBeCloseTo(-7.2)
    expect(animated.headZ).toBeCloseTo(3.6)
  })
})
