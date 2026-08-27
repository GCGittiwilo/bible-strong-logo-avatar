import { blendVisibleRigState, type VisibleRigState } from '../rigTransition'
import { type AvatarSequence } from '@/features/animation/sequences'
import { resolveAvatarBehavior, type StudioAvatar } from '@/features/avatar/avatars'
import { expressionFields, type Expression } from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import defaultStudioDocument from '@/features/studio/defaultStudioDocument.json'

describe('visible rig transitions', () => {
  const avatar = defaultStudioDocument.library.avatars.find(item => item.name === 'Bible Strong')!
  const behavior = resolveAvatarBehavior(avatar as StudioAvatar, {
    expressions: defaultStudioDocument.expressions as Expression[],
    sequences: defaultStudioDocument.sequences as AvatarSequence[],
  })
  const animations = behavior.sequences.filter(sequence =>
    ['Animations', 'Loading'].includes(sequence.group)
  )
  const expressionById = new Map(
    behavior.expressions.map(expression => [expression.id, expression])
  )

  it('starts every animation-to-animation handoff at the exact visible source state', () => {
    expect(animations).toHaveLength(12)
    let checkedPairs = 0
    animations.forEach((source, sourceIndex) => {
      animations.forEach((target, targetIndex) => {
        if (source.id === target.id) return
        const sourceExpression = {
          ...defaultExpression,
          ...expressionById.get(source.steps[0].expressionId)!,
        }
        const targetExpression = {
          ...defaultExpression,
          ...expressionById.get(target.steps[0].expressionId)!,
        }
        const from: VisibleRigState = {
          expression: {
            ...sourceExpression,
            headX: sourceExpression.headX + sourceIndex * 7.3,
            headY: sourceExpression.headY - sourceIndex * 5.1,
          },
          eyeOffset: { x: sourceIndex - 5.5, y: 5.5 - sourceIndex * 0.6 },
          stageOffset: { x: sourceIndex * 1.7, y: -sourceIndex * 1.2 },
          faceForwardAmount: source.presentation === 'logo' ? 1 : 0,
        }
        const destination: VisibleRigState = {
          expression: targetExpression,
          eyeOffset: { x: targetIndex * 0.8, y: -targetIndex * 0.5 },
          stageOffset: { x: -targetIndex, y: targetIndex * 1.3 },
          faceForwardAmount: target.presentation === 'logo' ? 1 : 0,
        }
        const firstFrame = blendVisibleRigState(from, destination, 0)

        expressionFields.forEach(field => {
          expect(firstFrame.expression[field]).toBe(from.expression[field])
        })
        expect(firstFrame.eyeOffset.x).toBeCloseTo(from.eyeOffset.x)
        expect(firstFrame.eyeOffset.y).toBeCloseTo(from.eyeOffset.y)
        expect(firstFrame.stageOffset.x).toBeCloseTo(from.stageOffset.x)
        expect(firstFrame.stageOffset.y).toBeCloseTo(from.stageOffset.y)
        expect(firstFrame.faceForwardAmount).toBe(from.faceForwardAmount)
        checkedPairs += 1
      })
    })
    expect(checkedPairs).toBe(132)
  })

  it('uses the shortest rotational route while continuously blending all rig channels', () => {
    const expression = { ...defaultExpression, ...behavior.expressions[0] }
    const from: VisibleRigState = {
      expression: { ...expression, headY: 350 },
      eyeOffset: { x: -18, y: 12 },
      stageOffset: { x: -14, y: 9 },
      faceForwardAmount: 0,
    }
    const target: VisibleRigState = {
      expression: { ...expression, headY: 10 },
      eyeOffset: { x: 20, y: -10 },
      stageOffset: { x: 16, y: -7 },
      faceForwardAmount: 1,
    }
    const halfway = blendVisibleRigState(from, target, 0.5)

    expect(halfway.expression.headY).toBeCloseTo(360)
    expect(halfway.eyeOffset).toEqual({ x: 1, y: 1 })
    expect(halfway.stageOffset).toEqual({ x: 1, y: 1 })
    expect(halfway.faceForwardAmount).toBe(0.5)
  })
})
