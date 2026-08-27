import {
  advanceSequenceCursor,
  createInitialSequences,
  getSequenceSpring,
  normalizeSequencesForExpressions,
  parseSequences,
  remapSequencesAfterExpressionDelete,
  resolveSequenceFaceForward,
  resolveSequenceGazeProfile,
} from '@/features/animation/sequences'
import { initialExpressions } from '@/features/avatar/presets'

describe('editable avatar sequences', () => {
  it('creates the ready animation with editable steps and blink settings', () => {
    const ready = createInitialSequences().find(sequence => sequence.id === 'ready')

    expect(ready?.steps.map(step => step.expressionId)).toEqual([
      initialExpressions[0].id,
      initialExpressions[8].id,
    ])
    expect(ready?.steps[0].holdMs).toBe(5200)
    expect(ready?.blink.durationMs).toBe(280)
    expect(ready?.presentation).toBe('face')
  })

  it('supports loop, once and ping-pong playback cursors', () => {
    const base = createInitialSequences().find(sequence => sequence.id === 'listening')!

    expect(advanceSequenceCursor({ ...base, playbackMode: 'loop' }, 2, 1)).toEqual({
      index: 0,
      direction: 1,
      complete: false,
    })
    expect(advanceSequenceCursor({ ...base, playbackMode: 'once' }, 2, 1).complete).toBe(true)
    expect(advanceSequenceCursor({ ...base, playbackMode: 'pingPong' }, 2, 1)).toEqual({
      index: 1,
      direction: -1,
      complete: false,
    })
  })

  it('keeps sequence references stable when expressions are reordered', () => {
    const sequence = createInitialSequences().find(item => item.id === 'ready')!
    const reordered = [...initialExpressions].reverse()
    const [normalized] = normalizeSequencesForExpressions([sequence], reordered)

    expect(normalized.steps.map(step => step.expressionId)).toEqual(
      sequence.steps.map(step => step.expressionId)
    )
  })

  it('keeps a sequence playable when its only referenced expression is deleted', () => {
    const source = createInitialSequences().find(item => item.id === 'transcribing')!
    const sequence = { ...source, steps: [source.steps[0]] }
    const fallbackId = initialExpressions[12].id
    const [remapped] = remapSequencesAfterExpressionDelete(
      [sequence],
      initialExpressions[1].id,
      fallbackId
    )

    expect(remapped.steps).toHaveLength(1)
    expect(remapped.steps[0].expressionId).toBe(fallbackId)
  })

  it('sanitizes persisted timing values and invalid playback values', () => {
    const [sequence] = parseSequences([
      {
        id: 'custom',
        name: 'Custom',
        playbackMode: 'invalid',
        steps: [{ expressionId: initialExpressions[2].id, holdMs: -5, transitionMs: 99999 }],
        blink: { minIntervalMs: 9000, maxIntervalMs: 1000, durationMs: 2 },
      },
    ])

    expect(sequence.playbackMode).toBe('loop')
    expect(sequence.steps[0].holdMs).toBe(0)
    expect(sequence.steps[0].transitionMs).toBe(5000)
    expect(sequence.blink.maxIntervalMs).toBe(sequence.blink.minIntervalMs)
    expect(sequence.blink.durationMs).toBe(40)
  })

  it('repairs missing and out-of-range expression references on load', () => {
    const sequence = createInitialSequences().find(item => item.id === 'ready')!
    const [normalized] = normalizeSequencesForExpressions(
      [{ ...sequence, steps: [{ ...sequence.steps[0], expressionId: 'missing' }] }],
      initialExpressions.slice(0, 4)
    )

    expect(normalized.steps[0].expressionId).toBe(initialExpressions[0].id)
  })

  it('maps transition styles and durations to distinct spring dynamics', () => {
    const smooth = getSequenceSpring('smooth', 900, 7)
    const snappy = getSequenceSpring('snappy', 250, 7)

    expect(snappy.stiffness).toBeGreaterThan(smooth.stiffness)
    expect(smooth.damping).toBeGreaterThan(0)
  })

  it('orders the chatbot pipeline and assigns status effects', () => {
    const sequences = createInitialSequences()

    expect(sequences.map(sequence => sequence.id)).toEqual([
      'ready',
      'listening',
      'transcribing',
      'thinking',
      'searching',
      'working',
      'speaking',
      'complete',
      'error',
    ])
    expect(sequences.find(sequence => sequence.id === 'thinking')?.effect).toBe('thinking')
    expect(sequences.find(sequence => sequence.id === 'thinking')?.gazeProfile).toBe('reflective')
    expect(sequences.find(sequence => sequence.id === 'searching')?.gazeProfile).toBe('scanning')
    expect(sequences.every(sequence => resolveSequenceGazeProfile(sequence) !== null)).toBe(true)
    expect(sequences.every(sequence => sequence.faceMode === 'attached')).toBe(true)
    expect(new Set(sequences.map(sequence => sequence.group))).toEqual(
      new Set(['Eye + Head Movement'])
    )
  })

  it('lets each animation choose whether the face stays locked or follows the body', () => {
    expect(resolveSequenceFaceForward(true, { faceMode: 'locked' })).toBe(true)
    expect(resolveSequenceFaceForward(true, { faceMode: 'attached' })).toBe(false)
    expect(resolveSequenceFaceForward(false, { faceMode: 'locked' })).toBe(false)
  })

  it('preserves a valid face behavior when loading saved animations', () => {
    const [sequence] = parseSequences([
      {
        ...createInitialSequences()[0],
        id: 'attached-spin',
        faceMode: 'attached',
        gazeProfile: 'orbit',
      },
    ])

    expect(sequence.faceMode).toBe('attached')
    expect(sequence.gazeProfile).toBe('orbit')
  })

  it('lets authored actions disable the procedural gaze rig', () => {
    const [sequence] = parseSequences([
      {
        ...createInitialSequences()[0],
        id: 'authored-action',
        gazeProfile: 'none',
      },
    ])

    expect(sequence.gazeProfile).toBe('none')
    expect(resolveSequenceGazeProfile(sequence)).toBeNull()
  })

  it('preserves interactive cursor drivers in saved animations', () => {
    const [sequence] = parseSequences([
      {
        ...createInitialSequences()[0],
        id: 'cursor-mode',
        driver: 'autonomous',
      },
    ])

    expect(sequence.driver).toBe('autonomous')
  })
})
