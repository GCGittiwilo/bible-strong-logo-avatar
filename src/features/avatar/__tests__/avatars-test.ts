import { defaultExpression } from '@/features/avatar/presets'
import { createInitialSequences } from '@/features/animation/sequences'
import {
  applyAvatarEyeDefaults,
  cloneAvatarBehavior,
  createAvatar,
  defaultAvatarEyes,
  parseAvatarLibrary,
  parseAvatarEyeDefaults,
  resolveAvatarBehavior,
} from '@/features/avatar/avatars'
import { parseAvatarMouth } from '@/features/avatar/mouth'
import { initialExpressions } from '@/features/avatar/presets'

describe('avatar eye defaults', () => {
  it('keeps the historical rendering when using default values', () => {
    expect(applyAvatarEyeDefaults(defaultExpression, defaultAvatarEyes)).toEqual(defaultExpression)
  })

  it('composes avatar defaults as variations around the neutral expression', () => {
    const expression = { ...defaultExpression, widthLeft: 28, positionYLeft: 5 }
    const eyes = { ...defaultAvatarEyes, widthLeft: 30, positionYLeft: -12 }

    const result = applyAvatarEyeDefaults(expression, eyes)

    expect(result.widthLeft).toBe(38)
    expect(result.positionYLeft).toBe(0)
    expect(expression.widthLeft).toBe(28)
  })

  it('sanitizes partial persisted values', () => {
    const result = parseAvatarEyeDefaults({ widthLeft: 42, heightRight: Number.NaN })

    expect(result.widthLeft).toBe(42)
    expect(result.heightRight).toBe(defaultAvatarEyes.heightRight)
    expect(result.spacing).toBe(defaultAvatarEyes.spacing)
  })
})

describe('avatar mouth', () => {
  it('accepts comic and polished mouths and rejects unsafe persisted values', () => {
    const mouth = parseAvatarMouth({
      style: 'comic',
      positionX: 0,
      positionY: 50,
      width: 52,
      height: 34,
      color: '#111316',
      tongueColor: '#f27d91',
    })

    expect(mouth?.style).toBe('comic')
    expect(parseAvatarMouth({ ...mouth, style: 'polished' })?.style).toBe('polished')
    expect(parseAvatarMouth({ ...mouth, color: 'red' })).toBeUndefined()
    expect(parseAvatarMouth({ ...mouth, width: -1 })).toBeUndefined()
  })
})

describe('avatar behavior library', () => {
  const base = {
    expressions: initialExpressions,
    sequences: createInitialSequences(),
  }

  it('inherits the base library until the avatar owns a customization', () => {
    const avatar = createAvatar('Strobi')

    expect(resolveAvatarBehavior(avatar, base)).toBe(base)
  })

  it('clones expressions, animations and nested steps as one independent library', () => {
    const behavior = cloneAvatarBehavior(base)

    expect(behavior).not.toBe(base)
    expect(behavior.expressions).not.toBe(base.expressions)
    expect(behavior.sequences).not.toBe(base.sequences)
    expect(behavior.sequences[0].steps).not.toBe(base.sequences[0].steps)
    expect(behavior.sequences[0].blink).not.toBe(base.sequences[0].blink)
  })
})

describe('avatar body revisions', () => {
  const base = {
    expressions: initialExpressions,
    sequences: createInitialSequences(),
  }

  it('upgrades an older persisted mascot body while preserving its other settings', () => {
    const fallbackAvatar = {
      ...createAvatar('Cloudee'),
      id: 'cloud',
      bodyRevision: 1,
      body: {
        primary: { ...createAvatar('fallback').body.primary, width: 132 },
        nodes: [],
      },
    }
    const storedAvatar = {
      ...fallbackAvatar,
      bodyRevision: undefined,
      body: {
        primary: { ...fallbackAvatar.body.primary, width: 160 },
        nodes: [],
      },
      colors: { body: '#ffffff', eyes: '#000000' },
    }

    const result = parseAvatarLibrary(
      { activeAvatarId: 'cloud', avatars: [storedAvatar] },
      { activeAvatarId: 'cloud', avatars: [fallbackAvatar] },
      base
    )

    expect(result.avatars[0].body.primary.width).toBe(132)
    expect(result.avatars[0].bodyRevision).toBe(1)
    expect(result.avatars[0].colors.body).toBe('#ffffff')
  })
})

describe('avatar behavior revisions', () => {
  const base = {
    expressions: initialExpressions,
    sequences: createInitialSequences(),
  }

  it('moves an older mascot back to the shared library when its bundled behavior is upgraded', () => {
    const fallbackAvatar = {
      ...createAvatar('Bible Strong'),
      id: 'logo',
      behaviorRevision: 1,
    }
    const storedAvatar = {
      ...fallbackAvatar,
      behaviorRevision: undefined,
      behavior: {
        expressions: [{ ...defaultExpression, id: 'old-logo-expression' }],
        sequences: [],
      },
    }

    const result = parseAvatarLibrary(
      { activeAvatarId: 'logo', avatars: [storedAvatar] },
      { activeAvatarId: 'logo', avatars: [fallbackAvatar] },
      base
    )

    expect(result.avatars[0].behavior).toBeUndefined()
    expect(result.avatars[0].behaviorRevision).toBe(1)
    expect(resolveAvatarBehavior(result.avatars[0], base)).toBe(base)
  })

  it('removes a persisted mouth when the bundled mascot declares a newer mouth revision', () => {
    const oldMouth = {
      style: 'comic' as const,
      positionX: 0,
      positionY: 34,
      width: 54,
      height: 32,
      color: '#050607',
      tongueColor: '#f27d91',
    }
    const fallbackAvatar = {
      ...createAvatar('Bible Strong'),
      id: 'logo',
      mouthRevision: 1,
    }
    const storedAvatar = { ...fallbackAvatar, mouthRevision: undefined, mouth: oldMouth }

    const result = parseAvatarLibrary(
      { activeAvatarId: 'logo', avatars: [storedAvatar] },
      { activeAvatarId: 'logo', avatars: [fallbackAvatar] },
      base
    )

    expect(result.avatars[0].mouth).toBeUndefined()
    expect(result.avatars[0].mouthRevision).toBe(1)
  })

  it('adds connected head and character animations plus continuous logo loading', () => {
    const behavior = resolveAvatarBehavior(
      { ...createAvatar('Bible Strong Spins'), spinAnimations: true, faceForward: true },
      base
    )

    expect(behavior.expressions).toHaveLength(base.expressions.length + 36)
    expect(behavior.sequences).toHaveLength(base.sequences.length + 12)
    expect(behavior.sequences.filter(sequence => sequence.group === 'Animations')).toHaveLength(11)
    expect(
      behavior.sequences
        .filter(sequence => sequence.group === 'Animations')
        .every(sequence => sequence.faceMode === 'attached')
    ).toBe(true)
    expect(
      behavior.sequences
        .filter(sequence => sequence.group === 'Animations')
        .every(sequence => sequence.gazeProfile && sequence.playbackMode === 'once')
    ).toBe(true)
    expect(
      behavior.sequences
        .filter(sequence => sequence.id.startsWith('character-'))
        .map(sequence => sequence.name)
    ).toEqual(['Laughing', 'Crying', 'Jumping', 'Excited Bounce', 'Surprised Jolt', 'Shy Sway'])
    expect(behavior.sequences.at(-1)).toMatchObject({
      id: 'loading',
      group: 'Loading',
      presentation: 'logo',
      faceMode: 'locked',
    })
    expect(behavior.sequences.at(-1)?.steps).toHaveLength(8)
    expect(behavior.sequences.at(-1)?.steps.every(step => step.transition === 'linear')).toBe(true)
    expect(behavior.sequences.at(-1)?.steps.every(step => step.holdMs === 0)).toBe(true)
  })

  it('centers saved logo eyes when the bundled eye layout is upgraded', () => {
    const fallbackAvatar = {
      ...createAvatar('Bible Strong Spins'),
      id: 'logo',
      eyesRevision: 1,
      eyes: { ...defaultAvatarEyes, positionYLeft: 0, positionYRight: 0 },
    }
    const storedAvatar = {
      ...fallbackAvatar,
      eyesRevision: undefined,
      eyes: { ...fallbackAvatar.eyes, positionYLeft: -18, positionYRight: -18 },
    }

    const result = parseAvatarLibrary(
      { activeAvatarId: 'logo', avatars: [storedAvatar] },
      { activeAvatarId: 'logo', avatars: [fallbackAvatar] },
      base
    )

    expect(result.avatars[0].eyes.positionYLeft).toBe(0)
    expect(result.avatars[0].eyes.positionYRight).toBe(0)
    expect(result.avatars[0].eyesRevision).toBe(1)
  })
})
