import { createBodyNode } from '@/features/avatar/body'
import {
  centerFaceExpression,
  renderAvatar,
  poseFromExpression,
  renderEyeEditor,
} from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import {
  createRenderedColors,
  createRenderedScene,
  findBodyNodePath,
  paintRenderedColors,
  paintRenderedScene,
} from '@/features/rendering/renderedScene'
import { surfacePresets } from '@/features/avatar/surfaces'
import defaultStudioDocument from '@/features/studio/defaultStudioDocument.json'
import type { BodyNode } from '@/features/avatar/body'
import type { Expression } from '@/features/avatar/geometry'
import type { SurfaceConfig } from '@/features/avatar/surfaces'

describe('rendered avatar scene', () => {
  it('keeps layer identity and hit mapping behind the scene seam', () => {
    const node = createBodyNode('sphere', 0)
    const first = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, {
      bodyNodes: [node],
    })
    const scene = createRenderedScene(first)
    const rotated = renderAvatar(
      poseFromExpression({ ...defaultExpression, headY: 35 }),
      surfacePresets.sphere,
      1,
      { bodyNodes: [node] }
    )

    paintRenderedScene(scene, rotated)

    expect(findBodyNodePath(scene, 'primary')).toBe(scene.headPath)
    expect(findBodyNodePath(scene, node.id)).not.toBeNull()
    expect(scene.headPath.get()).toBe(rotated.headPath)
  })

  it('updates animated colors without replacing their motion values', () => {
    const colors = createRenderedColors({ body: '#5b7fe5', eyes: '#111316' })
    const body = colors.body
    const eyes = colors.eyes

    paintRenderedColors(colors, { body: '#c53b47', eyes: '#ffffff' })

    expect(colors.body).toBe(body)
    expect(colors.eyes).toBe(eyes)
    expect(colors.body.get()).toBe('#c53b47')
    expect(colors.eyes.get()).toBe('#ffffff')
  })

  it('layers Cloudee lobes around the face and across a turned view', () => {
    const avatar = defaultStudioDocument.library.avatars.find(item => item.name === 'Cloudee')!
    const expression = defaultStudioDocument.expressions[5] as Expression

    const geometry = renderAvatar(
      poseFromExpression(expression),
      avatar.body.primary as SurfaceConfig,
      1,
      { bodyNodes: avatar.body.nodes as BodyNode[] }
    )

    expect(geometry.frontNodeIds).toEqual(['shape-cloud-front-left', 'shape-cloud-front-right'])

    const clearlyTurned = renderAvatar(
      poseFromExpression({ ...expression, headY: -35 }),
      avatar.body.primary as SurfaceConfig,
      1,
      { bodyNodes: avatar.body.nodes as BodyNode[] }
    )
    expect(clearlyTurned.frontNodeIds).toContain('shape-d4b4e8ad-8625-488d-920c-c497da226f9f')
  })

  it('can rotate the mascot body while keeping its face directed at the viewer', () => {
    const turnedExpression = { ...defaultExpression, headX: 48, headY: 82, headZ: 31 }
    const forward = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.cube, 1, {
      faceForward: true,
    })
    const spinning = renderAvatar(poseFromExpression(turnedExpression), surfacePresets.cube, 1, {
      faceForward: true,
    })

    expect(spinning.headPath).not.toBe(forward.headPath)
    expect(spinning.leftPath).toBe(forward.leftPath)
    expect(spinning.rightPath).toBe(forward.rightPath)
  })

  it('continuously blends the face between head-attached and viewer-locked rigs', () => {
    const expression = { ...defaultExpression, headX: 42, headY: -68, headZ: 24 }
    const pose = poseFromExpression(expression)
    const attached = renderAvatar(pose, surfacePresets.cube, 1, { faceForwardAmount: 0 })
    const halfway = renderAvatar(pose, surfacePresets.cube, 1, { faceForwardAmount: 0.5 })
    const locked = renderAvatar(pose, surfacePresets.cube, 1, { faceForwardAmount: 1 })

    expect(attached.leftPath).not.toBe(halfway.leftPath)
    expect(halfway.leftPath).not.toBe(locked.leftPath)
    expect(attached.rightPath).not.toBe(halfway.rightPath)
    expect(halfway.rightPath).not.toBe(locked.rightPath)
    expect(renderAvatar(pose, surfacePresets.cube, 1).leftPath).toBe(attached.leftPath)
    expect(renderAvatar(pose, surfacePresets.cube, 1, { faceForward: true }).leftPath).toBe(
      locked.leftPath
    )
  })

  it('keeps the Bible Strong face inside one continuous frame aperture', () => {
    const avatar = defaultStudioDocument.library.avatars.find(item => item.name === 'Bible Strong')!
    const forward = renderAvatar(
      poseFromExpression(defaultExpression),
      avatar.body.primary as SurfaceConfig,
      1,
      { bodyNodes: avatar.body.nodes as BodyNode[] }
    )
    const turned = renderAvatar(
      poseFromExpression({ ...defaultExpression, headY: 68 }),
      avatar.body.primary as SurfaceConfig,
      1,
      { bodyNodes: avatar.body.nodes as BodyNode[] }
    )
    const scene = createRenderedScene(forward)

    expect(forward.faceClipPath).not.toBe(forward.headPath)
    expect(forward.faceClipPath.match(/L/g)).toHaveLength(3)
    expect(turned.faceClipPath).not.toBe(forward.faceClipPath)

    paintRenderedScene(scene, turned)
    expect(scene.faceClipPath.get()).toBe(turned.faceClipPath)
  })

  it('projects the Bible Strong eyes onto an invisible spherical rig', () => {
    const avatar = defaultStudioDocument.library.avatars.find(item => item.name === 'Bible Strong')!
    const pose = poseFromExpression({ ...defaultExpression, headX: 18, headY: 38 })
    const flat = renderAvatar(pose, avatar.body.primary as SurfaceConfig, 1)
    const spherical = renderAvatar(pose, avatar.body.primary as SurfaceConfig, 1, {
      bodyNodes: avatar.body.nodes as BodyNode[],
    })
    const editor = renderEyeEditor(pose, avatar.body.primary as SurfaceConfig, -1, true)

    expect(spherical.headPath).toBe(flat.headPath)
    expect(spherical.leftPath).not.toBe(flat.leftPath)
    expect(spherical.rightPath).not.toBe(flat.rightPath)
    expect(editor.selectionPath).toBe(spherical.leftPath)
  })

  it('anchors the face center while preserving animation expression changes', () => {
    const firstExpression = {
      ...defaultExpression,
      headY: 90,
      widthLeft: 18,
      widthRight: 40,
      heightLeft: 55,
      heightRight: 22,
      positionXLeft: -14,
      positionXRight: 8,
      positionYLeft: -40,
      positionYRight: 20,
      spacing: 92,
    }
    const secondExpression = {
      ...defaultExpression,
      headY: 180,
      widthLeft: 48,
      widthRight: 16,
      heightLeft: 20,
      heightRight: 50,
      positionXLeft: 6,
      positionXRight: 22,
      positionYLeft: 46,
      positionYRight: -18,
      spacing: 28,
    }
    const first = renderAvatar(poseFromExpression(firstExpression), surfacePresets.cube, 1, {
      faceForward: true,
    })
    const second = renderAvatar(poseFromExpression(secondExpression), surfacePresets.cube, 1, {
      faceForward: true,
    })

    expect(second.headPath).not.toBe(first.headPath)
    expect(second.leftPath).not.toBe(first.leftPath)
    expect(second.rightPath).not.toBe(first.rightPath)
    const centeredFirst = centerFaceExpression(firstExpression)
    const centeredSecond = centerFaceExpression(secondExpression)
    expect(centeredFirst.positionXLeft + centeredFirst.positionXRight).toBe(0)
    expect(centeredFirst.positionYLeft + centeredFirst.positionYRight).toBe(0)
    expect(centeredSecond.positionXLeft + centeredSecond.positionXRight).toBe(0)
    expect(centeredSecond.positionYLeft + centeredSecond.positionYRight).toBe(0)
  })
})
