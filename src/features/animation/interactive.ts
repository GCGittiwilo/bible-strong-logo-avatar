export const CURSOR_SEQUENCE_DRIVERS = ['cursor', 'autonomous'] as const
export type SequenceDriver = (typeof CURSOR_SEQUENCE_DRIVERS)[number]

export const AUTONOMOUS_EXPRESSION_INDEXES = [11, 12, 13, 14, 16, 20, 52, 15, 3, 0, 9] as const
export const AUTONOMOUS_ACTION_IDS = [
  'character-jumping',
  'character-excited-bounce',
  'character-surprised-jolt',
] as const

export const randomBetween = (minimum: number, maximum: number, random = Math.random) =>
  minimum + (maximum - minimum) * random()

export const pickDifferent = <T>(
  values: readonly T[],
  previous: T | null,
  random = Math.random
): T | null => {
  if (!values.length) return null
  const choices = values.length > 1 ? values.filter(value => value !== previous) : [...values]
  return choices[Math.min(Math.floor(random() * choices.length), choices.length - 1)] ?? null
}
