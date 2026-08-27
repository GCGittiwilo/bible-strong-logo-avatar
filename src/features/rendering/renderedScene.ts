import { motionValue, type MotionValue } from 'motion'

import type { AvatarColors, AvatarLogoMorph } from '../avatar/avatars'
import { MAX_BODY_NODES } from '../avatar/body'
import type { AvatarGeometry } from '../avatar/geometry'

export type RenderedScene = {
  headPath: MotionValue<string>
  faceClipPath: MotionValue<string>
  backPaths: MotionValue<string>[]
  frontPaths: MotionValue<string>[]
  backPathOpacities: MotionValue<number>[]
  frontPathOpacities: MotionValue<number>[]
  backNodeIds: { current: (string | null)[] }
  frontNodeIds: { current: (string | null)[] }
  leftPath: MotionValue<string>
  rightPath: MotionValue<string>
  leftOpacity: MotionValue<number>
  rightOpacity: MotionValue<number>
  mouthPath: MotionValue<string>
  tonguePath: MotionValue<string>
  mouthOpacity: MotionValue<number>
  offsetX: MotionValue<number>
  offsetY: MotionValue<number>
  statusAnchorX: MotionValue<number>
  statusAnchorY: MotionValue<number>
  wirePaths: MotionValue<string>[]
}

export type RenderedColors = {
  body: MotionValue<string>
  eyes: MotionValue<string>
}

const bodyPathSlots = MAX_BODY_NODES + 2

const statusAnchor = (geometry: AvatarGeometry) => {
  const values = [geometry.headPath, ...geometry.backPaths, ...geometry.frontPaths]
    .flatMap(path => path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [])
    .map(Number)
  const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({
    x: values[index * 2],
    y: values[index * 2 + 1],
  })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (!points.length) return { x: 0, y: -118 }
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  return { x: maxX - 23, y: minY - 25 }
}

export const createRenderedScene = (geometry: AvatarGeometry): RenderedScene => ({
  headPath: motionValue(geometry.headPath),
  faceClipPath: motionValue(geometry.faceClipPath),
  backPaths: Array.from({ length: bodyPathSlots }, (_, index) =>
    motionValue(geometry.backPaths[index] ?? '')
  ),
  frontPaths: Array.from({ length: bodyPathSlots }, (_, index) =>
    motionValue(geometry.frontPaths[index] ?? '')
  ),
  backPathOpacities: Array.from({ length: bodyPathSlots }, () => motionValue(1)),
  frontPathOpacities: Array.from({ length: bodyPathSlots }, () => motionValue(1)),
  backNodeIds: { current: geometry.backNodeIds },
  frontNodeIds: { current: geometry.frontNodeIds },
  leftPath: motionValue(geometry.leftPath),
  rightPath: motionValue(geometry.rightPath),
  leftOpacity: motionValue(geometry.leftVisible ? 1 : 0),
  rightOpacity: motionValue(geometry.rightVisible ? 1 : 0),
  mouthPath: motionValue(geometry.mouthPath),
  tonguePath: motionValue(geometry.tonguePath),
  mouthOpacity: motionValue(geometry.mouthVisible ? 1 : 0),
  offsetX: motionValue(0),
  offsetY: motionValue(0),
  statusAnchorX: motionValue(statusAnchor(geometry).x),
  statusAnchorY: motionValue(statusAnchor(geometry).y),
  wirePaths: geometry.wirePaths.map(path => motionValue(path)),
})

export const createRenderedColors = (colors: AvatarColors): RenderedColors => ({
  body: motionValue(colors.body),
  eyes: motionValue(colors.eyes),
})

export const paintRenderedColors = (rendered: RenderedColors, colors: AvatarColors) => {
  rendered.body.set(colors.body)
  rendered.eyes.set(colors.eyes)
}

export const paintRenderedOffset = (scene: RenderedScene, offset: { x: number; y: number }) => {
  scene.offsetX.set(offset.x)
  scene.offsetY.set(offset.y)
}

export const paintRenderedScene = (
  scene: RenderedScene,
  geometry: AvatarGeometry,
  updateStatusAnchor = true
) => {
  scene.headPath.set(geometry.headPath)
  scene.faceClipPath.set(geometry.faceClipPath)
  scene.backNodeIds.current = geometry.backNodeIds
  scene.frontNodeIds.current = geometry.frontNodeIds
  scene.backPaths.forEach((path, index) => path.set(geometry.backPaths[index] ?? ''))
  scene.frontPaths.forEach((path, index) => path.set(geometry.frontPaths[index] ?? ''))
  scene.leftPath.set(geometry.leftPath)
  scene.rightPath.set(geometry.rightPath)
  scene.leftOpacity.set(geometry.leftVisible ? 1 : 0)
  scene.rightOpacity.set(geometry.rightVisible ? 1 : 0)
  scene.mouthPath.set(geometry.mouthPath)
  scene.tonguePath.set(geometry.tonguePath)
  scene.mouthOpacity.set(geometry.mouthVisible ? 1 : 0)
  if (updateStatusAnchor) {
    const anchor = statusAnchor(geometry)
    scene.statusAnchorX.set(anchor.x)
    scene.statusAnchorY.set(anchor.y)
  }
  scene.wirePaths.forEach((path, index) => path.set(geometry.wirePaths[index] ?? ''))
}

export const paintRenderedLogoMorph = (
  scene: RenderedScene,
  logoMorph: AvatarLogoMorph | undefined,
  faceReveal: number
) => {
  const centerNodeIds = new Set(logoMorph?.centerNodeIds ?? [])
  const centerOpacity = Math.max(0, Math.min(1, 1 - faceReveal))
  scene.backPathOpacities.forEach((opacity, index) => {
    opacity.set(centerNodeIds.has(scene.backNodeIds.current[index] ?? '') ? centerOpacity : 1)
  })
  scene.frontPathOpacities.forEach((opacity, index) => {
    opacity.set(centerNodeIds.has(scene.frontNodeIds.current[index] ?? '') ? centerOpacity : 1)
  })
}

export const findBodyNodePath = (scene: RenderedScene, selectedBodyNodeId: 'primary' | string) => {
  if (selectedBodyNodeId === 'primary') return scene.headPath
  const backIndex = scene.backNodeIds.current.indexOf(selectedBodyNodeId)
  if (backIndex >= 0) return scene.backPaths[backIndex]
  const frontIndex = scene.frontNodeIds.current.indexOf(selectedBodyNodeId)
  return frontIndex >= 0 ? scene.frontPaths[frontIndex] : null
}
