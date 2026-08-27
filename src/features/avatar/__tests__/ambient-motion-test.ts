import {
  ambientBodyOffset,
  ambientEyeOffset,
  applyAmbientBodyMotion,
  applyAmbientMotion,
  applyCoordinatedGaze,
  coordinatedGazeAt,
  hasAmbientMotion,
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

  it('moves the eyes first, then turns the head toward the same 3D target', () => {
    const earlyGaze = coordinatedGazeAt('scanning', 650)
    const followedGaze = coordinatedGazeAt('scanning', 1200)
    const animated = applyCoordinatedGaze(defaultExpression, followedGaze)

    expect(earlyGaze.eyeOffset.x).not.toBeCloseTo(0)
    expect(earlyGaze.headOffset.y).toBeCloseTo(0)
    expect(animated.headY).not.toBeCloseTo(defaultExpression.headY)
    expect(Math.sign(animated.headY)).toBe(Math.sign(followedGaze.target.x))
  })

  it('resolves large looks through socket, neck, and forward-facing body limits', () => {
    const gaze = coordinatedGazeAt('scanning', 1700)

    expect(Math.abs(gaze.eyeSocket.yaw)).toBeLessThanOrEqual(18)
    expect(Math.abs(gaze.eyeSocket.pitch)).toBeLessThanOrEqual(13)
    expect(Math.abs(gaze.neckOffset.yaw)).toBeLessThanOrEqual(36)
    expect(Math.abs(gaze.neckOffset.pitch)).toBeLessThanOrEqual(24)
    expect(Math.abs(gaze.bodyOffset.yaw)).toBeLessThanOrEqual(10)
    expect(Math.abs(gaze.bodyOffset.pitch)).toBeLessThanOrEqual(6)
    expect(Math.sign(gaze.eyeSocket.yaw)).toBe(Math.sign(gaze.neckOffset.yaw))
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
