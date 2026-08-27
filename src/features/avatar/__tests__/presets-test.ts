import { getStatePlaybackConfig, initialExpressions } from '@/features/avatar/presets'

describe('state playback configuration', () => {
  it('keeps expression presets limited to eye shape rather than movement', () => {
    expect(
      initialExpressions.every(
        expression =>
          expression.headX === 0 &&
          expression.headY === 0 &&
          expression.headZ === 0 &&
          expression.positionXLeft === 0 &&
          expression.positionXRight === 0 &&
          expression.positionYLeft === 0 &&
          expression.positionYRight === 0
      )
    ).toBe(true)
  })

  it('keeps ready slower than an active sequence', () => {
    expect(getStatePlaybackConfig('ready').expressionIntervalMs).toBe(5200)
    expect(getStatePlaybackConfig('listening').expressionIntervalMs).toBe(2300)
  })

  it('describes a valid randomized blink interval', () => {
    const { blink } = getStatePlaybackConfig('ready')

    expect(blink.initialDelayMs).toBeGreaterThan(0)
    expect(blink.minIntervalMs).toBeLessThan(blink.maxIntervalMs)
    expect(blink.durationMs).toBe(280)
  })

  it('uses a blink rhythm adapted to each sequence family', () => {
    const ready = getStatePlaybackConfig('ready').blink
    const listening = getStatePlaybackConfig('listening').blink
    const speaking = getStatePlaybackConfig('speaking').blink

    expect(listening.minIntervalMs).toBeGreaterThan(ready.minIntervalMs)
    expect(ready.minIntervalMs).toBeGreaterThan(speaking.minIntervalMs)
    expect(ready.durationMs).toBeGreaterThan(speaking.durationMs)
  })
})
