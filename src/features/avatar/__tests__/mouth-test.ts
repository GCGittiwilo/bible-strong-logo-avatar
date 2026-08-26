import { poseFromExpression, renderAvatar } from '@/features/avatar/geometry'
import {
  comicTalkingMouthPoseAt,
  comicThinkingMouthPoseAt,
  idleComicMouthPose,
  type AvatarMouth,
} from '@/features/avatar/mouth'
import { defaultExpression } from '@/features/avatar/presets'
import { surfacePresets } from '@/features/avatar/surfaces'

const mouth: AvatarMouth = {
  style: 'comic',
  positionX: 0,
  positionY: 50,
  width: 52,
  height: 34,
  color: '#111316',
  tongueColor: '#f27d91',
}

const polishedMouth: AvatarMouth = { ...mouth, style: 'polished' }

describe('comic talking mouth', () => {
  it('renders an idle mouth on the facial surface', () => {
    const geometry = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth,
    })

    expect(geometry.mouthPath).toMatch(/^M/)
    expect(geometry.mouthVisible).toBe(true)
    expect(geometry.tonguePath).toBe('')
  })

  it('changes shape over time without requiring phoneme input', () => {
    const first = comicTalkingMouthPoseAt(120)
    const second = comicTalkingMouthPoseAt(260)

    expect(first).not.toEqual(second)
    expect(first.openness).toBeGreaterThanOrEqual(0)
    expect(first.openness).toBeLessThanOrEqual(1)
    expect(comicTalkingMouthPoseAt(120, true)).toEqual(comicTalkingMouthPoseAt(900, true))
  })

  it('uses a slower, tongue-free pondering rhythm', () => {
    const first = comicThinkingMouthPoseAt(200)
    const second = comicThinkingMouthPoseAt(900)

    expect(first).not.toEqual(second)
    expect(first.tongue).toBe(0)
    expect(second.openness).toBeLessThan(0.1)
    expect(comicThinkingMouthPoseAt(200, true)).toEqual(comicThinkingMouthPoseAt(900, true))
  })

  it('adds the tongue only to open speaking poses', () => {
    const idle = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth,
      mouthPose: idleComicMouthPose,
    })
    const talking = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth,
      mouthPose: { ...comicTalkingMouthPoseAt(120), openness: 0.9, tongue: 1 },
    })

    expect(idle.tonguePath).toBe('')
    expect(talking.tonguePath).toMatch(/^M/)
    expect(talking.mouthPath).not.toBe(idle.mouthPath)
  })
})

describe('polished mascot mouth', () => {
  it('keeps a smooth resting smile and opens cleanly for speech', () => {
    const idle = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth: polishedMouth,
      mouthPose: idleComicMouthPose,
    })
    const talking = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth: polishedMouth,
      mouthPose: { ...comicTalkingMouthPoseAt(120), openness: 0.9, tongue: 1 },
    })

    expect(idle.mouthPath).toMatch(/^M/)
    expect(idle.tonguePath).toBe('')
    expect(talking.mouthPath).not.toBe(idle.mouthPath)
    expect(talking.tonguePath).toMatch(/^M/)
  })

  it('dampens comic wobble so the logo mouth remains symmetrical and premium', () => {
    const basePose = { ...comicTalkingMouthPoseAt(300), tilt: 0, offsetX: 0, offsetY: 0 }
    const first = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth: polishedMouth,
      mouthPose: { ...basePose, wobble: -0.2 },
    })
    const second = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      mouth: polishedMouth,
      mouthPose: { ...basePose, wobble: 0.2 },
    })

    expect(first.mouthPath).toBe(second.mouthPath)
  })
})
