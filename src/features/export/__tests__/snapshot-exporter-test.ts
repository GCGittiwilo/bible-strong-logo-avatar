import { poseFromExpression, renderAvatar } from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import { createRenderedScene, paintRenderedOffset } from '@/features/rendering/renderedScene'
import { serializeAvatarSnapshot, snapshotFileName } from '@/features/export/snapshotExporter'
import { surfacePresets } from '@/features/avatar/surfaces'

describe('avatar snapshot export', () => {
  const geometry = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1)
  const scene = createRenderedScene(geometry)
  const colors = { body: '#5b7fe5', eyes: '#111316' }

  it('exports the currently rendered scene as a transparent SVG', () => {
    paintRenderedOffset(scene, { x: 3, y: -2 })
    const svg = serializeAvatarSnapshot('Strobi', scene, colors, {
      background: 'transparent',
      colorFrom: '#ffffff',
      colorTo: '#000000',
      size: 1024,
    })

    expect(svg).toContain('width="1024" height="1024"')
    expect(svg).toContain('transform="translate(3 -2)"')
    expect(svg).toContain(`d="${geometry.headPath}" fill="#5b7fe5"`)
    expect(svg).toContain('fill="#111316"')
    expect(svg).not.toContain('<rect')
  })

  it('embeds a radial background without external dependencies', () => {
    const svg = serializeAvatarSnapshot('Strobi', scene, colors, {
      background: 'radial',
      colorFrom: '#ffffff',
      colorTo: '#8899aa',
      size: 512,
    })

    expect(svg).toContain('<radialGradient id="snapshot-radial"')
    expect(svg).toContain('fill="url(#snapshot-radial)"')
    expect(snapshotFileName('Étoile du soir')).toBe('etoile-du-soir-snapshot.svg')
    expect(snapshotFileName('Étoile du soir', 'png')).toBe('etoile-du-soir-snapshot.png')
  })

  it('includes a configured comic mouth in the captured SVG', () => {
    const mouth = {
      style: 'comic' as const,
      positionX: 0,
      positionY: 50,
      width: 52,
      height: 34,
      color: '#111316',
      tongueColor: '#f27d91',
    }
    const mouthScene = createRenderedScene(
      renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1, { mouth })
    )
    const svg = serializeAvatarSnapshot(
      'Cloudee',
      mouthScene,
      colors,
      {
        background: 'transparent',
        colorFrom: '#ffffff',
        colorTo: '#000000',
        size: 512,
      },
      mouth
    )

    expect(svg).toContain(`d="${mouthScene.mouthPath.get()}" fill="#111316"`)
  })

  it('captures either side of a logo-to-face morph', () => {
    const node = {
      id: 'logo-center',
      name: 'Center',
      surface: { ...surfacePresets.cube, width: 40, height: 12, depth: 12 },
      position: [0, 0, 0] as const,
      rotation: [0, 0, 0] as const,
    }
    const logoScene = createRenderedScene(
      renderAvatar(poseFromExpression(defaultExpression), surfacePresets.cube, 1, {
        bodyNodes: [node],
      })
    )
    const logoMorph = { centerNodeIds: [node.id], primaryOpacity: 0 }
    const logoSvg = serializeAvatarSnapshot(
      'Logo',
      logoScene,
      colors,
      {
        background: 'transparent',
        colorFrom: '#ffffff',
        colorTo: '#000000',
        size: 512,
      },
      undefined,
      { logoMorph },
      0
    )
    const faceSvg = serializeAvatarSnapshot(
      'Logo',
      logoScene,
      colors,
      {
        background: 'transparent',
        colorFrom: '#ffffff',
        colorTo: '#000000',
        size: 512,
      },
      undefined,
      { logoMorph },
      1
    )

    expect(logoSvg).toContain('opacity="0"><path')
    expect(faceSvg).toContain('opacity="1"><path')
    expect(faceSvg).toContain('opacity="0"/>')
    expect(faceSvg).toContain('clip-path="url(#snapshot-head-clip)"')
  })
})
