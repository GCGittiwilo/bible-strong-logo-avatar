import {
  AUTONOMOUS_ACTION_IDS,
  AUTONOMOUS_EXPRESSION_INDEXES,
  pickDifferent,
  randomBetween,
} from '@/features/animation/interactive'

describe('interactive mascot animation helpers', () => {
  it('keeps the requested autonomous expression and reaction pools exact', () => {
    expect(AUTONOMOUS_EXPRESSION_INDEXES).toEqual([11, 12, 13, 14, 16, 20, 52, 15, 3, 0, 9])
    expect(AUTONOMOUS_ACTION_IDS).toEqual([
      'character-jumping',
      'character-excited-bounce',
      'character-surprised-jolt',
    ])
  })

  it('avoids immediately repeating a choice and keeps delays bounded', () => {
    expect(pickDifferent([0, 1, 2], 1, () => 0)).toBe(0)
    expect(pickDifferent([0, 1, 2], 1, () => 0.99)).toBe(2)
    expect(randomBetween(100, 200, () => 0)).toBe(100)
    expect(randomBetween(100, 200, () => 1)).toBe(200)
  })
})
