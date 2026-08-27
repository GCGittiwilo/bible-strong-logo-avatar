import { createAvatar } from '@/features/avatar/avatars'
import { parse } from '@babel/parser'
import {
  createAvatarExportPayload,
  generateJavaScriptAvatarHtml,
  generateJavaScriptAvatarModule,
  generateJavaScriptAvatarPackage,
  generateReactAvatarComponent,
  generateReactAvatarPackage,
  generateReactAvatarRuntime,
} from '@/features/export/exporter'
import { initialExpressions } from '@/features/avatar/presets'
import { createInitialSequences } from '@/features/animation/sequences'

describe('avatar export', () => {
  const avatar = createAvatar('Strobi')
  avatar.mouth = {
    style: 'comic',
    positionX: 0,
    positionY: 50,
    width: 52,
    height: 34,
    color: '#111316',
    tongueColor: '#f27d91',
  }
  const animations = createInitialSequences().filter(item =>
    ['ready', 'listening'].includes(item.id)
  )
  const payload = createAvatarExportPayload(avatar, initialExpressions, animations)

  it('includes only the selected animations and their referenced expressions', () => {
    expect(Object.keys(payload.animations)).toEqual(['ready', 'listening'])
    expect(Object.keys(payload.expressions).sort()).toEqual(
      [
        ...new Set(animations.flatMap(animation => animation.steps.map(step => step.expressionId))),
      ].sort()
    )
    expect(payload).not.toHaveProperty('frames')
    expect(payload.avatar.name).toBe('Strobi')
    expect(payload.avatar.mouth?.style).toBe('comic')
    expect(payload.animations.listening.effect).toBe('listening')
    expect(payload.animations.listening.presentation).toBe('face')
    expect(payload.animations.listening.faceMode).toBe('attached')
    expect(payload.animations.listening.gazeProfile).toBe('attentive')
  })

  it('preserves face-locking in reusable exports', () => {
    const faceLocked = createAvatarExportPayload(
      { ...avatar, faceForward: true },
      initialExpressions,
      animations
    )

    expect(faceLocked.avatar.faceForward).toBe(true)
  })

  it('preserves attached-face animation behavior in reusable exports', () => {
    const attachedAnimation = { ...animations[0], id: 'attached', faceMode: 'attached' as const }
    const attached = createAvatarExportPayload(
      { ...avatar, faceForward: true },
      initialExpressions,
      [attachedAnimation]
    )

    expect(attached.animations.attached.faceMode).toBe('attached')
    expect(generateJavaScriptAvatarModule(attached)).toContain("faceMode !== 'attached'")
  })

  it('exports cursor and autonomous animation drivers', () => {
    const cursorAnimation = {
      ...animations[0],
      id: 'cursor-follow',
      driver: 'cursor' as const,
    }
    const cursorPayload = createAvatarExportPayload(avatar, initialExpressions, [cursorAnimation])
    const source = generateJavaScriptAvatarModule(cursorPayload)

    expect(cursorPayload.animations['cursor-follow'].driver).toBe('cursor')
    expect(source).toContain("addEventListener('pointermove', followPointer")
    expect(source).toContain("driver === 'autonomous'")
    expect(source).toContain('startAutonomous')
    expect(source).toContain('gazeReleaseFrom = lastRenderedGaze')
    expect(source).toContain('blendCoordinatedGaze')
    expect(source).toContain('preserveAttachedFace')
  })

  it('generates a standalone JavaScript module without a Web Component', () => {
    const source = generateJavaScriptAvatarModule(payload)

    expect(source).toContain('export function createAvatar')
    expect(source).toContain('play(animationName)')
    expect(source).toContain('export const availableAnimations')
    expect(source).toContain('pausedRemainingMs')
    expect(source).toContain('pausedBlinkDelay')
    expect(source).toContain('pausedBlink')
    expect(source).toContain('step.transition')
    expect(source).toContain('stepIndex = 0')
    expect(source).toContain('setTalking(next)')
    expect(source).toContain('comicTalkingMouthPoseAt')
    expect(source).toContain('setThinking(next)')
    expect(source).toContain('comicThinkingMouthPoseAt')
    expect(source).toContain('coordinatedGazeAt')
    expect(source).toContain('applyCoordinatedGaze')
    expect(source).toContain('setGaze(x, y)')
    expect(source).toContain('solveGazeRig')
    expect(source).not.toContain('customElements.define')
    expect(source).not.toContain("from '")
    expect(() => parse(source, { sourceType: 'module' })).not.toThrow()
  })

  it('uses the Studio geometry engine to render interpolated transition frames', () => {
    const source = generateJavaScriptAvatarModule(payload)

    expect(source).toContain('AvatarProceduralEngine')
    expect(source).toContain('expressionFields')
    expect(source).toContain('requestAnimationFrame')
    expect(source).not.toContain('avatarFrameIn')
  })

  it('generates an HTML demo that works when opened directly from the filesystem', () => {
    const source = generateJavaScriptAvatarHtml(payload)

    expect(source).not.toContain("import { createAvatar } from './avatar.js'")
    expect(source).toContain('function createAvatar')
    expect(source).toContain('avatar.play("ready")')
  })

  it('generates an interactive playground for the exported animations', () => {
    const source = generateJavaScriptAvatarHtml(payload)

    expect(source).toContain('id="animation-list"')
    expect(source).toContain('id="play-animation"')
    expect(source).toContain('id="pause-animation"')
    expect(source).toContain('id="stop-animation"')
    expect(source).toContain('availableAnimations.forEach')
    expect(source).toContain('avatar.play(activeAnimation)')
    expect(source).toContain('avatar.pause()')
    expect(source).toContain('avatar.stop()')
    expect(source).toContain('id="toggle-talking"')
    expect(source).toContain('id="toggle-thinking"')
    expect(source).toContain('avatar.setTalking(talking)')
    expect(source).toContain('avatar.setThinking(thinking)')
    expect(source).toContain("createAvatar('#avatar'")
  })

  it('localizes the exported playground', () => {
    const source = generateJavaScriptAvatarHtml(payload, 'fr')

    expect(source).toContain('<html lang="fr">')
    expect(source).toContain('Choisissez une animation exportée')
    expect(source).toContain('▶ Lire')
    expect(source).toContain('En pause')
  })

  it('keeps user-authored names and descriptions inside the generated script', () => {
    const source = generateJavaScriptAvatarHtml({
      ...payload,
      avatar: { ...payload.avatar, name: '</title><script>alert(1)</script>' },
    })

    expect(source).not.toContain('</title><script>alert(1)</script>')
    expect(source).toContain('&lt;/title&gt;')
    expect(source).toContain('\\u003c/script>')
  })

  it('packages the direct-open demo and reusable module together', async () => {
    const archive = new Uint8Array(await generateJavaScriptAvatarPackage(payload).arrayBuffer())
    const contents = new TextDecoder().decode(archive)

    expect(contents).toContain('index.html')
    expect(contents).toContain('avatar.js')
  })

  it('generates a typed React component backed by the local runtime', () => {
    const source = generateReactAvatarComponent(payload)

    expect(source).toContain("from 'react'")
    expect(source).toContain("from './avatar-runtime'")
    expect(source).toContain("from './strobi.avatar'")
    expect(source).toContain('export type { AnimationName }')
    expect(source).toContain('animation?: AnimationName')
    expect(source).toContain('talking?: boolean')
    expect(source).toContain('thinking?: boolean')
    expect(source).toContain('startTalking: () => void')
    expect(source).toContain('startThinking: () => void')
    expect(source).toContain('forwardRef<AvatarHandle, AvatarProps>')
    expect(source).not.toContain('AvatarProceduralEngine')
    expect(source).toContain('runtime.createAvatar(host.current')
    expect(source).not.toContain('@ts-nocheck')
    expect(source).not.toContain('avatarFrameIn')
    expect(source).not.toContain("from 'motion")
    expect(() =>
      parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    ).not.toThrow()
  })

  it('packages the React runtime, avatar data and component separately', async () => {
    const archive = new Uint8Array(await generateReactAvatarPackage(payload).arrayBuffer())
    const contents = new TextDecoder().decode(archive)

    expect(contents).toContain('avatar-runtime.ts')
    expect(contents).toContain('strobi.avatar.ts')
    expect(contents).toContain('Strobi.tsx')
    expect(contents).toContain('strobi.index.ts')
    expect(contents).toContain("from './avatar-runtime'")
  })

  it('generates one avatar-independent and versioned React runtime', () => {
    const runtime = generateReactAvatarRuntime()

    expect(runtime).toContain('AVATAR_RUNTIME_VERSION = 1')
    expect(runtime).toContain('data.version !== AVATAR_RUNTIME_VERSION')
    expect(runtime).not.toContain(payload.avatar.name)
    expect(runtime).toContain('RuntimeAvatar<AnimationName>')
    expect(() => parse(runtime, { sourceType: 'module', plugins: ['typescript'] })).not.toThrow()
  })

  it('uses globally unique SVG identifiers across avatar runtimes', () => {
    const source = generateJavaScriptAvatarModule(payload)

    expect(source).toContain('globalThis.crypto.randomUUID()')
    expect(source).not.toContain('avatarInstanceCount')
  })
})
