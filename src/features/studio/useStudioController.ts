import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { useStudioLanguage } from '@/i18n'

import {
  AMBIENT_FRAME_MS,
  bounded,
  createExpressionId,
  downloadBlob,
  INSPECTOR_FRAME_MS,
  interpolateHexColor,
  poseWithAvatarEyes,
  resolveColors,
  RETARGET_BLEND_MS,
  type ExportFormat,
  type Highlight,
  type Mode,
  type PlaybackStatus,
  type Side,
  type SnapshotFormat,
} from '@/app/studio-utils'
import {
  advancePlaybackTimeline,
  beginPlayback,
  createPlaybackTimeline,
  pausePlaybackTimeline,
  schedulePlaybackBlink,
  schedulePlaybackStep,
  stopPlaybackTimeline,
} from '@/features/animation/playback'
import {
  AUTONOMOUS_ACTION_IDS,
  pickDifferent,
  randomBetween,
} from '@/features/animation/interactive'
import {
  createSequence,
  duplicateSequence,
  findExpressionIndex,
  getSequenceSpring,
  readSequenceClock,
  remapSequencesAfterExpressionDelete,
  resolveSequenceFaceForward,
  resolveSequenceGazeProfile,
  type AvatarSequence,
  type SequenceStep,
} from '@/features/animation/sequences'
import {
  ambientBodyOffset,
  ambientEyeOffset,
  applyCoordinatedGaze,
  applyAmbientBodyMotion,
  blendCoordinatedGaze,
  coordinatedGazeAt,
  hasAmbientMotion,
  solveGazeRig,
  type CoordinatedGaze,
  type GazeProfile,
} from '@/features/avatar/ambientMotion'
import {
  cloneAvatarBehavior,
  createAvatar,
  defaultAvatarEyes,
  resolveAvatarBehavior,
  type AvatarBehaviorLibrary,
  type AvatarColors,
  type AvatarEyeDefaults,
  type StudioAvatar,
} from '@/features/avatar/avatars'
import {
  bodyPrimitiveTypes,
  createBodyNode,
  duplicateBodyNode,
  MAX_BODY_NODES,
  type BodyNode,
} from '@/features/avatar/body'
import {
  scaleEye,
  updateEyeDimension,
  updateEyePosition,
} from '@/features/avatar/expressionEditing'
import {
  expressionFields,
  poseFromExpression,
  renderAvatar,
  type AvatarPose,
  type Expression,
} from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import { comicTalkingMouthPoseAt, comicThinkingMouthPoseAt } from '@/features/avatar/mouth'
import { type SurfaceConfig } from '@/features/avatar/surfaces'
import {
  avatarExportFileName,
  createAvatarExportPayload,
  generateJavaScriptAvatarPackage,
  generateReactAvatarPackage,
} from '@/features/export/exporter'
import {
  serializeAvatarSnapshot,
  snapshotFileName,
  type SnapshotBackground,
} from '@/features/export/snapshotExporter'
import {
  resolveCanvasPreviewExpression,
  type CanvasPreviewTarget,
} from '@/features/rendering/canvasPreview'
import {
  createRenderedRotationGizmo,
  paintRenderedRotationGizmo,
} from '@/features/rendering/renderedRotationGizmo'
import {
  createRenderedColors,
  createRenderedScene,
  paintRenderedColors,
  paintRenderedLogoMorph,
  paintRenderedOffset,
  paintRenderedScene,
} from '@/features/rendering/renderedScene'

import {
  createStudioDocumentStore,
  loadStudioDocument,
  parseImportedStudioDocument,
  persistStudioDocument,
  serializeStudioDocument,
  type StatePlaybackSelection,
  type StudioDocument,
} from '@/features/studio/studioDocument'

const independentFaceExpression: Expression = {
  ...defaultExpression,
  headX: 0,
  headY: 0,
  headZ: 0,
  eyeMotion: 'microSaccades',
  bodyMotion: 'none',
}

export function useStudioController() {
  const { language, setLanguage, t } = useStudioLanguage()
  const [mode, setMode] = useState<Mode>('avatars')
  const [initialDocument] = useState(loadStudioDocument)
  const [documentStore] = useState(() => createStudioDocumentStore(initialDocument))
  const initialLibrary = initialDocument.library
  const bundledAvatarRevision = initialLibrary.bundledAvatarRevision
  const [avatars, setAvatars] = useState(initialLibrary.avatars)
  const [activeAvatarId, setActiveAvatarId] = useState(initialLibrary.activeAvatarId)
  const initialAvatar =
    initialLibrary.avatars.find(avatar => avatar.id === initialLibrary.activeAvatarId) ??
    initialLibrary.avatars[0]
  const [baseBehavior] = useState<AvatarBehaviorLibrary>(() => ({
    expressions: initialDocument.expressions,
    sequences: initialDocument.sequences,
  }))
  const initialBehavior = resolveAvatarBehavior(initialAvatar, baseBehavior)
  const [surface, setSurface] = useState(initialAvatar.body.primary)
  const [bodyNodes, setBodyNodes] = useState(initialAvatar.body.nodes)
  const [selectedBodyNodeId, setSelectedBodyNodeId] = useState<'primary' | string | null>('primary')
  const [selectedEyeSide, setSelectedEyeSide] = useState<-1 | 1 | null>(null)
  const [expressions, setExpressions] = useState(initialBehavior.expressions)
  const [sequences, setSequences] = useState(initialBehavior.sequences)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('react')
  const [exportAnimationIds, setExportAnimationIds] = useState(() =>
    initialBehavior.sequences.map(animation => animation.id)
  )
  const [snapshotBackground, setSnapshotBackground] = useState<SnapshotBackground>('transparent')
  const [snapshotColorFrom, setSnapshotColorFrom] = useState('#F5F7FC')
  const [snapshotColorTo, setSnapshotColorTo] = useState('#C9D5FF')
  const [snapshotSize, setSnapshotSize] = useState('1024')
  const [snapshotFormat, setSnapshotFormat] = useState<SnapshotFormat>('png')
  const [photoFlash, setPhotoFlash] = useState(0)
  const [talking, setTalking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [faceRevealed, setFaceRevealed] = useState(!initialAvatar.logoMorph)
  const [activeFaceForward, setActiveFaceForward] = useState(Boolean(initialAvatar.faceForward))
  const [manualGazeTarget, setManualGazeTargetState] = useState<{
    x: number
    y: number
  } | null>(null)
  const manualGazeTargetRef = useRef(manualGazeTarget)
  const [cursorFollowActive, setCursorFollowActive] = useState(false)
  const cursorFollowActiveRef = useRef(false)
  const cursorDesiredTarget = useRef({ x: 0, y: 0 })
  const cursorRenderedTarget = useRef({ x: 0, y: 0 })
  const cursorLastFrame = useRef(-1)
  const cursorFollowFrame = useRef<number | null>(null)
  const faceReveal = useMotionValue(initialAvatar.logoMorph ? 0 : 1)
  const faceRevealAnimation = useRef<ReturnType<typeof animate> | null>(null)
  const initialStatePlayback = initialDocument.playback
  const updateStudioLibrary = (library: typeof initialDocument.library) =>
    documentStore.update({
      library: {
        ...library,
        ...(bundledAvatarRevision ? { bundledAvatarRevision } : {}),
      },
    })
  const persistStatePlayback = (playback: StatePlaybackSelection) =>
    documentStore.update({ playback })
  const [bodyEditing, setBodyEditing] = useState(false)
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  const avatarEditSnapshot = useRef<{
    avatars: StudioAvatar[]
    activeAvatarId: string
  } | null>(null)
  const workspaceBackButtonRef = useRef<HTMLButtonElement>(null)
  const [focusAvatarName, setFocusAvatarName] = useState(false)
  const initialExpression = expressions[0] ?? defaultExpression
  const [expression, setExpression] = useState<Expression>({ ...initialExpression })
  const initialDisplayColors = resolveColors(initialExpression, initialAvatar.colors)
  const [renderedColors] = useState(() => createRenderedColors(initialDisplayColors))
  const setDisplayColors = (next: AvatarColors) => {
    paintRenderedColors(renderedColors, next)
  }
  const [deleteAvatarOpen, setDeleteAvatarOpen] = useState(false)
  const [deleteExpressionOpen, setDeleteExpressionOpen] = useState(false)
  const [deleteSequenceOpen, setDeleteSequenceOpen] = useState(false)
  const [pendingProjectImport, setPendingProjectImport] = useState<{
    document: StudioDocument
    fileName: string
  } | null>(null)
  const [projectImportError, setProjectImportError] = useState<string | null>(null)
  const projectImportRef = useRef<HTMLInputElement>(null)
  const [statePlayerExpanded, setStatePlayerExpanded] = useState(false)
  const [activeExpression, setActiveExpression] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ index: number | null; draft: Expression } | null>(null)
  const [showWire, setShowWire] = useState(false)
  const [springSpeed, setSpringSpeed] = useState(7)
  const [linked, setLinked] = useState({
    width: true,
    height: true,
    size: true,
    position: true,
    rotation: true,
  })
  const [highlight, setHighlight] = useState<Highlight>(null)
  const [selectedState, setSelectedState] = useState(() =>
    sequences.some(sequence => sequence.id === initialStatePlayback.stateId)
      ? initialStatePlayback.stateId!
      : sequences.some(sequence => sequence.id === 'ready')
        ? 'ready'
        : (sequences[0]?.id ?? '')
  )
  const [activeState, setActiveState] = useState<string | null>(null)
  const [statePlaying, setStatePlaying] = useState(false)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>(() =>
    initialStatePlayback.stateId === null ? 'stopped' : 'paused'
  )
  const [playbackVisual, setPlaybackVisual] = useState({
    position: null as number | null,
    run: 0,
    durationMs: 0,
  })
  const [sequenceEditing, setSequenceEditing] = useState<{
    sourceId: string | null
    draft: AvatarSequence
  } | null>(null)
  const [selectedSequenceStepId, setSelectedSequenceStepId] = useState<string | null>(null)
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autonomousExpressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autonomousActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autonomousActionStepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autonomousActionActive = useRef(false)
  const autonomousExpressionId = useRef<string | null>(null)
  const activeSequenceRef = useRef<AvatarSequence | null>(null)
  const activeGazeProfileRef = useRef<GazeProfile | null>(null)
  const editorStateSnapshot = useRef<{
    stateId: string
    playing: boolean
    expression: Expression
  } | null>(null)
  const initialStatePlaybackApplied = useRef(false)
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [initialPlaybackTimeline] = useState(createPlaybackTimeline)
  const playbackTimeline = useRef(initialPlaybackTimeline)
  const reduceMotion = useReducedMotion()

  const avatarsRef = useRef(avatars)
  const expressionsRef = useRef(expressions)
  const sequencesRef = useRef(sequences)
  const draggedAvatarId = useRef<string | null>(null)
  const avatarDragOrigin = useRef<StudioAvatar[] | null>(null)
  const avatarDragPreview = useRef(avatars)
  const [draggingAvatarId, setDraggingAvatarId] = useState<string | null>(null)
  const draggedExpressionId = useRef<string | null>(null)
  const expressionDragOrigin = useRef<Expression[] | null>(null)
  const expressionDragPreview = useRef(expressions)
  const [draggingExpressionId, setDraggingExpressionId] = useState<string | null>(null)
  const draggedStateId = useRef<string | null>(null)
  const stateDragOrigin = useRef<AvatarSequence[] | null>(null)
  const stateDragPreview = useRef(sequences)
  const [draggingStateId, setDraggingStateId] = useState<string | null>(null)
  const activeAvatarIdRef = useRef(activeAvatarId)
  const activeFaceForwardRef = useRef(Boolean(initialAvatar.faceForward))
  const surfaceRef = useRef(surface)
  const bodyNodesRef = useRef(bodyNodes)
  const showWireRef = useRef(showWire)
  const highlightRef = useRef(highlight)
  const persistActiveBehavior = (
    nextExpressions: Expression[],
    nextSequences: AvatarSequence[]
  ) => {
    const behavior = cloneAvatarBehavior({
      expressions: nextExpressions,
      sequences: nextSequences,
    })
    const nextAvatars = avatarsRef.current.map(avatar =>
      avatar.id === activeAvatarIdRef.current ? { ...avatar, behavior } : avatar
    )
    avatarsRef.current = nextAvatars
    setAvatars(nextAvatars)
    updateStudioLibrary({ activeAvatarId: activeAvatarIdRef.current, avatars: nextAvatars })
  }
  const updateStudioExpressions = (nextExpressions: Expression[]) => {
    expressionsRef.current = nextExpressions
    persistActiveBehavior(nextExpressions, sequencesRef.current)
  }
  const updateStudioSequences = (nextSequences: AvatarSequence[]) => {
    sequencesRef.current = nextSequences
    persistActiveBehavior(expressionsRef.current, nextSequences)
  }
  const [initialRender] = useState(() => {
    const pose = poseFromExpression(initialExpression)
    return {
      pose,
      geometry: renderAvatar(
        poseWithAvatarEyes(initialExpression, initialAvatar.eyes),
        surface,
        1,
        {
          bodyNodes,
          mouth: initialAvatar.mouth,
          faceForward: initialAvatar.faceForward,
        }
      ),
    }
  })
  const { pose: initialPose, geometry: initialGeometry } = initialRender
  const displayedPose = useRef<AvatarPose>(initialPose)
  const transitionFrame = useRef<number | null>(null)
  const ambientFrame = useRef<number | null>(null)
  const talkingFrame = useRef<number | null>(null)
  const talkingStartedAt = useRef(0)
  const thinkingStartedAt = useRef(0)
  const lastTalkingFrame = useRef(0)
  const eyeAmbientStartedAt = useRef(-1)
  const bodyAmbientStartedAt = useRef(-1)
  const lastEyeAmbientElapsed = useRef(0)
  const lastBodyAmbientElapsed = useRef(0)
  const lastAmbientFrame = useRef(0)
  const eyeAmbientSignature = useRef('none')
  const bodyAmbientSignature = useRef('none')
  const lastAmbientStrength = useRef(1)
  const lastAmbientExpression = useRef<Expression>({ ...initialExpression })
  const lastRenderedOffset = useRef({ x: 0, y: 0 })
  const sequenceOffsetBridge = useRef<{
    from: { x: number; y: number }
    startedAt: number
    durationMs: number
  } | null>(null)
  const gazeStartedAt = useRef(-1)
  const lastGazeElapsed = useRef(0)
  const lastRenderedGaze = useRef<CoordinatedGaze | null>(null)
  const gazeBlendFrom = useRef<CoordinatedGaze | null>(null)
  const gazeBlendStartedAt = useRef(-1)
  const gazeRelease = useRef<{
    from: CoordinatedGaze
    startedAt: number
    durationMs: number
  } | null>(null)
  const deferredFaceForward = useRef<boolean | null>(null)
  const transitionTarget = useRef<Expression>({ ...initialExpression })
  const canonicalTarget = useRef<Expression>({ ...initialExpression })
  const retargetFrom = useRef<Expression | null>(null)
  const retargetTo = useRef<Expression | null>(null)
  const retargetStartedAt = useRef<number | null>(null)
  const [transitionVelocity] = useState(
    () =>
      Object.fromEntries(expressionFields.map(field => [field, 0])) as Record<
        (typeof expressionFields)[number],
        number
      >
  )
  const lastTransitionTime = useRef<number | null>(null)
  const lastInspectorFrame = useRef(0)
  const springSpeedRef = useRef(springSpeed)
  const sequenceTransitionRef = useRef<Pick<SequenceStep, 'transitionMs' | 'transition'>>({
    transitionMs: 500,
    transition: 'smooth',
  })
  const activeSequenceTransition = useRef<{
    target: Expression
    index: number | null
    settings: Pick<SequenceStep, 'transitionMs' | 'transition'>
    remainingMs: number
  } | null>(null)
  const pausedSequenceTransition = useRef<typeof activeSequenceTransition.current>(null)
  const blinkControls = useRef<ReturnType<typeof animate> | null>(null)
  const blinkAnimating = useRef(false)
  const blinkValue = useMotionValue(1)
  const [renderedScene] = useState(() => createRenderedScene(initialGeometry))
  const [renderedRotationGizmo] = useState(() => createRenderedRotationGizmo(initialExpression))
  const bodyColorAnimation = useRef<ReturnType<typeof animate> | null>(null)
  const eyeColorAnimation = useRef<ReturnType<typeof animate> | null>(null)

  const updateActiveFaceForward = (next: boolean) => {
    if (activeFaceForwardRef.current === next) return
    activeFaceForwardRef.current = next
    setActiveFaceForward(next)
    eyeAmbientStartedAt.current = -1
    lastEyeAmbientElapsed.current = 0
    eyeAmbientSignature.current = 'none'
  }

  const paintPose = (
    pose: AvatarPose,
    blink?: number,
    frameTimeMs?: number,
    ambientStrength?: number
  ) => {
    displayedPose.current = pose
    const resolvedAmbientStrength =
      ambientStrength ?? (transitionFrame.current === null ? 1 : lastAmbientStrength.current)
    lastAmbientStrength.current = resolvedAmbientStrength
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    const faceForward = activeFaceForwardRef.current
    const eyeExpression = faceForward
      ? { ...independentFaceExpression, eyeMotion: pose.expression.eyeMotion }
      : pose.expression
    const eyeAmbientEnabled = !reduceMotion && eyeExpression.eyeMotion !== 'none'
    const bodyAmbientEnabled = !reduceMotion && pose.expression.bodyMotion !== 'none'
    const eyeSignature = eyeAmbientEnabled ? eyeExpression.eyeMotion : 'none'
    const bodySignature = bodyAmbientEnabled ? pose.expression.bodyMotion : 'none'
    if (eyeSignature !== eyeAmbientSignature.current) {
      eyeAmbientSignature.current = eyeSignature
      if (!faceForward) {
        eyeAmbientStartedAt.current = -1
        lastEyeAmbientElapsed.current = 0
      }
    }
    if (bodySignature !== bodyAmbientSignature.current) {
      bodyAmbientSignature.current = bodySignature
      bodyAmbientStartedAt.current = -1
      lastBodyAmbientElapsed.current = 0
    }
    if (eyeAmbientEnabled && frameTimeMs !== undefined) {
      if (eyeAmbientStartedAt.current < 0) eyeAmbientStartedAt.current = frameTimeMs
      lastEyeAmbientElapsed.current = frameTimeMs - eyeAmbientStartedAt.current
    }
    if (bodyAmbientEnabled && frameTimeMs !== undefined) {
      if (bodyAmbientStartedAt.current < 0) bodyAmbientStartedAt.current = frameTimeMs
      lastBodyAmbientElapsed.current = frameTimeMs - bodyAmbientStartedAt.current
    }
    const gazeProfile = activeGazeProfileRef.current
    if (cursorFollowActiveRef.current && frameTimeMs !== undefined) {
      const elapsed =
        cursorLastFrame.current < 0 ? 16 : Math.min(frameTimeMs - cursorLastFrame.current, 50)
      cursorLastFrame.current = frameTimeMs
      const blend = 1 - Math.exp(-elapsed / 72)
      cursorRenderedTarget.current = {
        x:
          cursorRenderedTarget.current.x +
          (cursorDesiredTarget.current.x - cursorRenderedTarget.current.x) * blend,
        y:
          cursorRenderedTarget.current.y +
          (cursorDesiredTarget.current.y - cursorRenderedTarget.current.y) * blend,
      }
      manualGazeTargetRef.current = cursorRenderedTarget.current
    }
    const gazeTarget = manualGazeTargetRef.current
    if (gazeProfile && frameTimeMs !== undefined) {
      if (gazeStartedAt.current < 0) gazeStartedAt.current = frameTimeMs - lastGazeElapsed.current
      lastGazeElapsed.current = frameTimeMs - gazeStartedAt.current
    }
    const rawGaze = gazeTarget
      ? solveGazeRig(gazeTarget, 1)
      : gazeProfile
        ? coordinatedGazeAt(gazeProfile, lastGazeElapsed.current, reduceMotion ? 0 : 1)
        : null
    let gaze = rawGaze
    if (gaze && activeSequenceRef.current?.group === 'Animations') {
      gaze = { ...gaze, headBaseWeight: 1 }
    }
    if (gaze && gazeRelease.current) gazeRelease.current = null
    const release = gazeRelease.current
    if (!gaze && release && frameTimeMs !== undefined) {
      if (release.startedAt < 0) release.startedAt = frameTimeMs
      const progress = Math.min((frameTimeMs - release.startedAt) / release.durationMs, 1)
      gaze = blendCoordinatedGaze(release.from, solveGazeRig({ x: 0, y: 0 }, 1, 1), progress)
      if (progress >= 1) gazeRelease.current = null
    }
    if (gaze && gazeBlendFrom.current && frameTimeMs !== undefined) {
      if (gazeBlendStartedAt.current < 0) gazeBlendStartedAt.current = frameTimeMs
      const progress = Math.min((frameTimeMs - gazeBlendStartedAt.current) / 520, 1)
      gaze = blendCoordinatedGaze(gazeBlendFrom.current, gaze, progress)
      if (progress >= 1) {
        gazeBlendFrom.current = null
        gazeBlendStartedAt.current = -1
      }
    }
    lastRenderedGaze.current = gaze
    const ambientExpression = bodyAmbientEnabled
      ? applyAmbientBodyMotion(
          pose.expression,
          lastBodyAmbientElapsed.current,
          resolvedAmbientStrength
        )
      : pose.expression
    lastAmbientExpression.current = { ...ambientExpression }
    const renderedExpression = gaze
      ? applyCoordinatedGaze(ambientExpression, gaze)
      : ambientExpression
    paintRenderedRotationGizmo(renderedRotationGizmo, renderedExpression)
    const ambientEye = eyeAmbientEnabled
      ? ambientEyeOffset(
          eyeExpression,
          lastEyeAmbientElapsed.current,
          faceForward ? 1 : resolvedAmbientStrength
        )
      : { x: 0, y: 0 }
    const eyeOffset = {
      x: ambientEye.x + (gaze?.eyeOffset.x ?? 0),
      y: ambientEye.y + (gaze?.eyeOffset.y ?? 0),
    }
    const renderPose = avatar
      ? poseWithAvatarEyes(renderedExpression, avatar.eyes ?? defaultAvatarEyes)
      : poseFromExpression(renderedExpression)
    const geometry = renderAvatar(renderPose, surfaceRef.current, blink ?? blinkValue.get(), {
      includeWire: showWireRef.current || highlightRef.current === 'head',
      bodyNodes: bodyNodesRef.current,
      eyeOffset,
      mouth: avatar?.mouth,
      faceForward,
      mouthPose: talking
        ? comicTalkingMouthPoseAt(
            (frameTimeMs ?? performance.now()) - talkingStartedAt.current,
            Boolean(reduceMotion)
          )
        : thinking
          ? comicThinkingMouthPoseAt(
              (frameTimeMs ?? performance.now()) - thinkingStartedAt.current,
              Boolean(reduceMotion)
            )
          : undefined,
    })
    // Parsing every SVG path for the thought-bubble anchor is expensive and is
    // only needed while that effect is actually visible.
    paintRenderedScene(renderedScene, geometry, thinking)
    paintRenderedLogoMorph(renderedScene, avatar?.logoMorph, faceReveal.get())
    const proceduralOffset = bodyAmbientEnabled
      ? ambientBodyOffset(pose.expression, lastBodyAmbientElapsed.current, resolvedAmbientStrength)
      : { x: 0, y: 0 }
    const ambientOffset = {
      x: pose.expression.stageX + proceduralOffset.x,
      y: pose.expression.stageY + proceduralOffset.y,
    }
    const bridge = sequenceOffsetBridge.current
    let renderedOffset = ambientOffset
    if (bridge) {
      if (bridge.startedAt < 0 && frameTimeMs !== undefined) bridge.startedAt = frameTimeMs
      const linearProgress =
        frameTimeMs === undefined || bridge.startedAt < 0
          ? 0
          : Math.min((frameTimeMs - bridge.startedAt) / bridge.durationMs, 1)
      const progress = linearProgress * linearProgress * (3 - 2 * linearProgress)
      renderedOffset = {
        x: bridge.from.x + (ambientOffset.x - bridge.from.x) * progress,
        y: bridge.from.y + (ambientOffset.y - bridge.from.y) * progress,
      }
      if (linearProgress >= 1) sequenceOffsetBridge.current = null
    }
    lastRenderedOffset.current = renderedOffset
    paintRenderedOffset(renderedScene, renderedOffset)
  }

  useMotionValueEvent(blinkValue, 'change', latest => paintPose(displayedPose.current, latest))

  const setManualGazeTarget = (target: { x: number; y: number } | null) => {
    const next = target
      ? {
          x: Math.max(-1, Math.min(1, target.x)),
          y: Math.max(-1, Math.min(1, target.y)),
        }
      : null
    manualGazeTargetRef.current = next
    setManualGazeTargetState(next)
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    updateActiveFaceForward(
      next ? false : resolveSequenceFaceForward(avatar?.faceForward, activeSequenceRef.current)
    )
    paintPose(displayedPose.current, undefined, performance.now())
  }
  const setCursorGazeTarget = (target: { x: number; y: number }) => {
    cursorDesiredTarget.current = {
      x: Math.max(-1, Math.min(1, target.x)),
      y: Math.max(-1, Math.min(1, target.y)),
    }
  }
  const updateCursorFollowEnabled = (next: boolean, releaseDurationMs?: number) => {
    const wasActive = cursorFollowActiveRef.current
    cursorFollowActiveRef.current = next
    setCursorFollowActive(next)
    cursorLastFrame.current = -1
    if (next) {
      gazeRelease.current = null
      if (!wasActive) {
        cursorDesiredTarget.current = { x: 0, y: 0 }
        cursorRenderedTarget.current = { x: 0, y: 0 }
      }
      manualGazeTargetRef.current = cursorRenderedTarget.current
      setManualGazeTargetState(null)
      updateActiveFaceForward(false)
      return
    }
    if (wasActive && releaseDurationMs && lastRenderedGaze.current) {
      gazeRelease.current = {
        from: lastRenderedGaze.current,
        startedAt: -1,
        durationMs: Math.max(releaseDurationMs, 1),
      }
    } else {
      gazeRelease.current = null
    }
    manualGazeTargetRef.current = null
    cursorDesiredTarget.current = { x: 0, y: 0 }
    cursorRenderedTarget.current = { x: 0, y: 0 }
  }
  useEffect(() => {
    if (!cursorFollowActive || reduceMotion) return
    const tick = (time: number) => {
      const deltaX = cursorDesiredTarget.current.x - cursorRenderedTarget.current.x
      const deltaY = cursorDesiredTarget.current.y - cursorRenderedTarget.current.y
      if (transitionFrame.current === null && Math.hypot(deltaX, deltaY) > 0.0001) {
        paintPose(displayedPose.current, undefined, time)
      }
      cursorFollowFrame.current = requestAnimationFrame(tick)
    }
    cursorFollowFrame.current = requestAnimationFrame(tick)
    return () => {
      if (cursorFollowFrame.current !== null) cancelAnimationFrame(cursorFollowFrame.current)
      cursorFollowFrame.current = null
    }
  }, [cursorFollowActive, reduceMotion])
  useMotionValueEvent(faceReveal, 'change', latest => {
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    paintRenderedLogoMorph(renderedScene, avatar?.logoMorph, latest)
    if (latest <= 0.001 && deferredFaceForward.current !== null) {
      const nextFaceForward = deferredFaceForward.current
      deferredFaceForward.current = null
      updateActiveFaceForward(nextFaceForward)
    }
  })

  const paintAmbientFrame = useEffectEvent((time: number) => {
    if (transitionFrame.current === null && time - lastAmbientFrame.current >= AMBIENT_FRAME_MS) {
      lastAmbientFrame.current = time
      paintPose(displayedPose.current, undefined, time)
    }
  })

  const ambientLoopActive =
    !reduceMotion &&
    !talking &&
    !thinking &&
    (hasAmbientMotion(editing?.draft ?? expression) || activeGazeProfileRef.current !== null)
  useEffect(() => {
    if (!ambientLoopActive) return
    const tick = (time: number) => {
      paintAmbientFrame(time)
      ambientFrame.current = requestAnimationFrame(tick)
    }
    ambientFrame.current = requestAnimationFrame(tick)
    return () => {
      if (ambientFrame.current !== null) cancelAnimationFrame(ambientFrame.current)
    }
  }, [ambientLoopActive])

  const paintTalkingFrame = useEffectEvent((time?: number) => {
    paintPose(displayedPose.current, undefined, time)
  })
  useEffect(() => {
    if (!talking && !thinking) {
      paintTalkingFrame()
      return
    }
    const startedAt = performance.now()
    if (talking) talkingStartedAt.current = startedAt
    if (thinking) thinkingStartedAt.current = startedAt
    if (reduceMotion) {
      paintTalkingFrame(startedAt)
      return
    }
    const tick = (time: number) => {
      if (time - lastTalkingFrame.current >= AMBIENT_FRAME_MS) {
        lastTalkingFrame.current = time
        paintTalkingFrame(time)
      }
      talkingFrame.current = requestAnimationFrame(tick)
    }
    talkingFrame.current = requestAnimationFrame(tick)
    return () => {
      if (talkingFrame.current !== null) cancelAnimationFrame(talkingFrame.current)
      talkingFrame.current = null
    }
  }, [talking, thinking, reduceMotion])

  useEffect(
    () => () => {
      if (transitionFrame.current !== null) cancelAnimationFrame(transitionFrame.current)
      if (talkingFrame.current !== null) cancelAnimationFrame(talkingFrame.current)
      if (cursorFollowFrame.current !== null) cancelAnimationFrame(cursorFollowFrame.current)
      blinkControls.current?.stop()
      bodyColorAnimation.current?.stop()
      eyeColorAnimation.current?.stop()
      faceRevealAnimation.current?.stop()
      if (stateTimer.current) clearTimeout(stateTimer.current)
      if (blinkTimer.current) clearTimeout(blinkTimer.current)
    },
    []
  )

  const stopTransition = (resetVelocity: boolean) => {
    if (transitionFrame.current !== null) cancelAnimationFrame(transitionFrame.current)
    transitionFrame.current = null
    lastTransitionTime.current = null
    retargetFrom.current = null
    retargetTo.current = null
    retargetStartedAt.current = null
    lastInspectorFrame.current = 0
    if (resetVelocity) {
      expressionFields.forEach(field => {
        transitionVelocity[field] = 0
      })
    }
  }

  const stopColorTransitions = () => {
    bodyColorAnimation.current?.stop()
    eyeColorAnimation.current?.stop()
    bodyColorAnimation.current = null
    eyeColorAnimation.current = null
  }

  const freezeLivePreviewForManipulation = () => {
    if (statePlaying) pauseState()
    const renderedExpression = { ...displayedPose.current.expression }
    stopTransition(true)
    stopColorTransitions()
    activeSequenceTransition.current = null
    pausedSequenceTransition.current = null
    transitionTarget.current = renderedExpression
    canonicalTarget.current = renderedExpression
    setExpression(renderedExpression)
    setActiveExpression(null)
    return renderedExpression
  }

  const updateImmediate = (next: Expression, preservePlayback = false) => {
    if (!preservePlayback && statePlaying) pauseState()
    stopTransition(true)
    stopColorTransitions()
    const pose = poseFromExpression(next)
    transitionTarget.current = next
    canonicalTarget.current = next
    setExpression(next)
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (avatar) setDisplayColors(resolveColors(next, avatar.colors))
    setActiveExpression(null)
    paintPose(pose)
  }

  const transitionToExpression = (
    next: Expression,
    index: number | null = null,
    transitionSettings?: Pick<SequenceStep, 'transitionMs' | 'transition'>
  ) => {
    if (!transitionSettings && statePlaying) pauseState()
    sequenceTransitionRef.current = transitionSettings ?? {
      transitionMs: 500,
      transition: 'smooth',
    }
    setActiveExpression(index)
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (reduceMotion || transitionSettings?.transitionMs === 0) {
      updateImmediate(next, Boolean(transitionSettings))
      setActiveExpression(index)
      return
    }
    const displayedExpression = displayedPose.current.expression
    const motionLayerChanges = displayedExpression.bodyMotion !== next.bodyMotion
    const current = motionLayerChanges ? lastAmbientExpression.current : displayedExpression
    const nearestAngle = (target: number, from: number) => {
      let resolved = target
      while (resolved - from > 180) resolved -= 360
      while (resolved - from < -180) resolved += 360
      return resolved
    }
    canonicalTarget.current = next
    const resolvedTarget = {
      ...next,
      headX: nearestAngle(next.headX, current.headX),
      headY: nearestAngle(next.headY, current.headY),
      headZ: nearestAngle(next.headZ, current.headZ),
      leftAngle: nearestAngle(next.leftAngle, current.leftAngle),
      rightAngle: nearestAngle(next.rightAngle, current.rightAngle),
    }

    if (transitionSettings) {
      if (motionLayerChanges) {
        sequenceOffsetBridge.current = {
          from: { ...lastRenderedOffset.current },
          startedAt: -1,
          durationMs: Math.max(transitionSettings.transitionMs, 1),
        }
      }
      stopTransition(true)
      stopColorTransitions()
      const durationMs = transitionSettings.transitionMs
      const from = { ...current }
      const preserveAmbientMotion =
        from.bodyMotion === next.bodyMotion && from.eyeMotion === next.eyeMotion
      lastAmbientStrength.current = preserveAmbientMotion ? 1 : 0
      const fromColors = {
        body: renderedColors.body.get(),
        eyes: renderedColors.eyes.get(),
      }
      const targetColors = avatar ? resolveColors(next, avatar.colors) : fromColors
      let startedAt: number | null = null
      activeSequenceTransition.current = {
        target: next,
        index,
        settings: transitionSettings,
        remainingMs: durationMs,
      }
      const tickSequenceTransition = (time: number) => {
        if (startedAt === null) startedAt = time
        const elapsed = time - startedAt
        const progress = Math.min(elapsed / durationMs, 1)
        const eased =
          transitionSettings.transition === 'linear'
            ? progress
            : transitionSettings.transition === 'smooth'
              ? progress * progress * (3 - 2 * progress)
              : transitionSettings.transition === 'snappy'
                ? 1 - (1 - progress) ** 3
                : 1 - Math.exp(-6 * progress) * Math.cos(8 * progress)
        const animated = { ...from, eyeMotion: next.eyeMotion, bodyMotion: next.bodyMotion }
        expressionFields.forEach(field => {
          animated[field] = from[field] + (resolvedTarget[field] - from[field]) * eased
        })
        activeSequenceTransition.current = {
          target: next,
          index,
          settings: transitionSettings,
          remainingMs: Math.max(durationMs - elapsed, 0),
        }
        setDisplayColors({
          body: interpolateHexColor(fromColors.body, targetColors.body, bounded(eased, 0, 1)),
          eyes: interpolateHexColor(fromColors.eyes, targetColors.eyes, bounded(eased, 0, 1)),
        })
        paintPose(
          poseFromExpression(animated),
          undefined,
          time,
          preserveAmbientMotion ? 1 : bounded(eased, 0, 1)
        )
        if (
          modeRef.current === 'manual' &&
          time - lastInspectorFrame.current >= INSPECTOR_FRAME_MS
        ) {
          lastInspectorFrame.current = time
          setExpression(animated)
        }
        if (progress < 1) {
          transitionFrame.current = requestAnimationFrame(tickSequenceTransition)
          return
        }
        transitionFrame.current = null
        activeSequenceTransition.current = null
        canonicalTarget.current = next
        transitionTarget.current = next
        setExpression(next)
        setDisplayColors(targetColors)
        paintPose(poseFromExpression(next))
      }
      transitionFrame.current = requestAnimationFrame(tickSequenceTransition)
      return
    }

    if (avatar) {
      const targetColors = resolveColors(next, avatar.colors)
      bodyColorAnimation.current = animate(renderedColors.body, targetColors.body, {
        duration: 0.35,
        ease: 'easeInOut',
      })
      eyeColorAnimation.current = animate(renderedColors.eyes, targetColors.eyes, {
        duration: 0.35,
        ease: 'easeInOut',
      })
    }

    if (transitionFrame.current !== null) {
      retargetFrom.current = { ...transitionTarget.current }
      retargetTo.current = resolvedTarget
      retargetStartedAt.current = -1
      return
    }
    transitionTarget.current = resolvedTarget
    lastAmbientStrength.current = 0
    const initialTransitionDistance = expressionFields.reduce(
      (total, field) => total + Math.abs(resolvedTarget[field] - current[field]),
      0
    )
    let transitionProgress = 0
    const tick = (time: number) => {
      const previousTime = lastTransitionTime.current ?? time
      const deltaTime = Math.min(Math.max((time - previousTime) / 1000, 1 / 240), 1 / 30)
      lastTransitionTime.current = time
      const { stiffness, damping } = getSequenceSpring(
        sequenceTransitionRef.current.transition,
        sequenceTransitionRef.current.transitionMs,
        springSpeedRef.current
      )
      const mass = 0.85
      const currentExpression = displayedPose.current.expression
      if (retargetStartedAt.current !== null && retargetFrom.current && retargetTo.current) {
        if (retargetStartedAt.current < 0) retargetStartedAt.current = time
        const linearProgress = Math.min((time - retargetStartedAt.current) / RETARGET_BLEND_MS, 1)
        const smoothProgress =
          linearProgress ** 3 * (linearProgress * (linearProgress * 6 - 15) + 10)
        const blendedTarget = { ...retargetTo.current }
        expressionFields.forEach(field => {
          blendedTarget[field] =
            retargetFrom.current![field] +
            (retargetTo.current![field] - retargetFrom.current![field]) * smoothProgress
        })
        transitionTarget.current = blendedTarget
        if (linearProgress === 1) {
          transitionTarget.current = retargetTo.current
          retargetFrom.current = null
          retargetTo.current = null
          retargetStartedAt.current = null
        }
      }
      const target = transitionTarget.current
      const remainingTransitionDistance = expressionFields.reduce(
        (total, field) => total + Math.abs(target[field] - currentExpression[field]),
        0
      )
      const geometricProgress =
        initialTransitionDistance <= 0
          ? 1
          : 1 - remainingTransitionDistance / initialTransitionDistance
      transitionProgress = Math.max(transitionProgress, bounded(geometricProgress, 0, 1))
      let settled = true
      const animated = { ...currentExpression }
      animated.eyeMotion = target.eyeMotion
      animated.bodyMotion = target.bodyMotion

      expressionFields.forEach(field => {
        const displacement = target[field] - currentExpression[field]
        const acceleration = (stiffness * displacement - damping * transitionVelocity[field]) / mass
        const velocity = transitionVelocity[field] + acceleration * deltaTime
        const value = currentExpression[field] + velocity * deltaTime
        transitionVelocity[field] = velocity
        animated[field] = value
        const tolerance = field === 'perspective' ? 0.0001 : 0.005
        if (Math.abs(displacement) > tolerance || Math.abs(velocity) > tolerance) settled = false
      })

      if (settled) {
        const finalExpression = canonicalTarget.current
        stopTransition(true)
        setExpression(finalExpression)
        paintPose(poseFromExpression(finalExpression))
        return
      }

      paintPose(poseFromExpression(animated), undefined, time, transitionProgress)
      if (modeRef.current === 'manual' && time - lastInspectorFrame.current >= INSPECTOR_FRAME_MS) {
        lastInspectorFrame.current = time
        setExpression(animated)
      }
      transitionFrame.current = requestAnimationFrame(tick)
    }
    transitionFrame.current = requestAnimationFrame(tick)
  }

  const blink = (durationMs?: number) => {
    blinkControls.current?.stop()
    blinkValue.jump(1)
    blinkAnimating.current = true
    const sequence = sequences.find(item => item.id === (activeState ?? selectedState))
    const blinkDuration = durationMs ?? sequence?.blink.durationMs ?? 280
    blinkControls.current = animate(blinkValue, [1, 0, 1], {
      duration: reduceMotion ? 0 : blinkDuration / 1000,
      times: [0, 0.42, 1],
      ease: ['easeIn', 'easeOut'],
      onComplete: () => {
        blinkAnimating.current = false
      },
    })
  }

  const updateDimension = (side: Side, dimension: 'width' | 'height', value: number) => {
    updateImmediate(updateEyeDimension(expression, side, dimension, value, linked[dimension]))
  }

  const updateSize = (side: Side, value: number) => {
    updateImmediate(scaleEye(expression, side, value, linked.size))
  }

  const updateSpacing = (value: number) => {
    updateImmediate({ ...expression, spacing: value })
  }

  const updateActiveAvatar = (update: (avatar: StudioAvatar) => StudioAvatar) => {
    const next = avatarsRef.current.map(avatar =>
      avatar.id === activeAvatarIdRef.current ? update(avatar) : avatar
    )
    avatarsRef.current = next
    setAvatars(next)
    if (!avatarEditSnapshot.current) {
      updateStudioLibrary({ activeAvatarId: activeAvatarIdRef.current, avatars: next })
    }
  }

  const selectBodyNode = (id: 'primary' | string | null) => {
    setSelectedBodyNodeId(id)
    if (id) setSelectedEyeSide(null)
  }

  const updateSurface = (next: SurfaceConfig) => {
    surfaceRef.current = next
    setSurface(next)
    updateActiveAvatar(avatar => ({
      ...avatar,
      body: { primary: next, nodes: bodyNodesRef.current },
    }))
    paintPose(displayedPose.current)
  }

  const updateBodyNodes = (next: BodyNode[]) => {
    bodyNodesRef.current = next
    setBodyNodes(next)
    updateActiveAvatar(avatar => ({
      ...avatar,
      body: { primary: surfaceRef.current, nodes: next },
    }))
    paintPose(displayedPose.current)
  }

  const updateAvatarColors = (changes: Partial<AvatarColors>) => {
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (!avatar) return
    const colors = { ...avatar.colors, ...changes }
    updateActiveAvatar(current => ({ ...current, colors }))
    setDisplayColors(resolveColors(expression, colors))
  }

  const updateAvatarEyes = (changes: Partial<AvatarEyeDefaults>) => {
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (!avatar) return
    const eyes = { ...(avatar.eyes ?? defaultAvatarEyes), ...changes }
    updateActiveAvatar(current => ({ ...current, eyes }))
    paintPose(displayedPose.current)
  }

  const activateAvatar = (id: string, editBody = false, preserveMode = false) => {
    const avatar = avatarsRef.current.find(item => item.id === id)
    if (!avatar) return
    setTalking(false)
    setThinking(false)
    faceRevealAnimation.current?.stop()
    faceRevealAnimation.current = null
    const nextFaceRevealed = !avatar.logoMorph
    faceReveal.jump(nextFaceRevealed ? 1 : 0)
    setFaceRevealed(nextFaceRevealed)
    const resumeActiveSequence = statePlaying
    if (resumeActiveSequence) pauseState(false)
    if (editBody) suspendStateForEditor()
    if (editBody && !avatarEditSnapshot.current) {
      avatarEditSnapshot.current = {
        avatars: avatarsRef.current,
        activeAvatarId: activeAvatarIdRef.current,
      }
    }
    const currentStateExpression = displayedPose.current.expression
    const nextBehavior = resolveAvatarBehavior(avatar, baseBehavior)
    const nextExpressions = nextBehavior.expressions
    const nextSequences = nextBehavior.sequences
    stopTransition(true)
    activeAvatarIdRef.current = id
    updateActiveFaceForward(Boolean(avatar.faceForward))
    surfaceRef.current = avatar.body.primary
    bodyNodesRef.current = avatar.body.nodes
    setActiveAvatarId(id)
    setSurface(avatar.body.primary)
    setBodyNodes(avatar.body.nodes)
    expressionsRef.current = nextExpressions
    sequencesRef.current = nextSequences
    expressionDragPreview.current = nextExpressions
    stateDragPreview.current = nextSequences
    setExpressions(nextExpressions)
    setSequences(nextSequences)
    setExportAnimationIds(nextSequences.map(animation => animation.id))
    const nextActiveSequence = activeState
      ? (nextSequences.find(sequence => sequence.id === activeState) ?? null)
      : null
    const nextSelectedState =
      nextActiveSequence?.id ??
      (nextSequences.some(sequence => sequence.id === 'ready')
        ? 'ready'
        : (nextSequences[0]?.id ?? ''))
    activeSequenceRef.current = nextActiveSequence
    activeGazeProfileRef.current = resolveSequenceGazeProfile(nextActiveSequence)
    gazeStartedAt.current = -1
    if (!nextActiveSequence) lastGazeElapsed.current = 0
    setActiveState(nextActiveSequence?.id ?? null)
    setSelectedState(nextSelectedState)
    setPlaybackVisual(current => ({ ...current, position: null }))
    selectBodyNode('primary')
    setActiveExpression(null)
    setEditing(null)
    setBodyEditing(editBody)
    if (!preserveMode || editBody) setMode('manual')
    const nextExpression = nextActiveSequence
      ? currentStateExpression
      : { ...(nextExpressions[0] ?? defaultExpression) }
    setExpression(nextExpression)
    setDisplayColors(resolveColors(nextExpression, avatar.colors))
    canonicalTarget.current = nextExpression
    transitionTarget.current = nextExpression
    paintPose(poseFromExpression(nextExpression))
    if (nextActiveSequence && resumeActiveSequence) {
      pausedSequenceTransition.current = null
      launchSequence(nextActiveSequence, true, false)
    }
    if (!avatarEditSnapshot.current) {
      updateStudioLibrary({ activeAvatarId: id, avatars: avatarsRef.current })
    }
  }

  const createNewAvatar = () => {
    avatarEditSnapshot.current = {
      avatars: avatarsRef.current,
      activeAvatarId: activeAvatarIdRef.current,
    }
    const avatar = createAvatar('Unknown')
    const next = [...avatarsRef.current, avatar]
    avatarsRef.current = next
    setAvatars(next)
    setFocusAvatarName(true)
    activateAvatar(avatar.id, true)
  }

  const duplicateAvatar = (source: StudioAvatar, editDuplicate = false) => {
    const snapshotAvatars = avatarEditSnapshot.current?.avatars ?? avatarsRef.current
    const sourceIndex = snapshotAvatars.findIndex(avatar => avatar.id === source.id)
    const baseAvatars = sourceIndex < 0 ? [...snapshotAvatars, source] : snapshotAvatars
    const duplicate: StudioAvatar = {
      ...structuredClone(source),
      id: `avatar-${crypto.randomUUID()}`,
      name: `${source.name} ${t('copie')}`,
    }
    const next = [...baseAvatars, duplicate]
    avatarEditSnapshot.current = null
    avatarsRef.current = next
    setAvatars(next)
    updateStudioLibrary({ activeAvatarId: duplicate.id, avatars: next })
    activateAvatar(duplicate.id, editDuplicate)
  }

  const previewAvatarMove = (targetId: string) => {
    const draggedId = draggedAvatarId.current
    if (!draggedId || draggedId === targetId) return
    const current = avatarDragPreview.current
    const dragged = current.find(avatar => avatar.id === draggedId)
    const targetIndex = current.findIndex(avatar => avatar.id === targetId)
    if (!dragged || targetIndex < 0) return
    const next = current.filter(avatar => avatar.id !== draggedId)
    next.splice(targetIndex, 0, dragged)
    avatarDragPreview.current = next
    setAvatars(next)
  }

  const commitAvatarMove = (targetId: string) => {
    previewAvatarMove(targetId)
    const next = avatarDragPreview.current
    avatarsRef.current = next
    updateStudioLibrary({ activeAvatarId: activeAvatarIdRef.current, avatars: next })
    avatarDragOrigin.current = null
    draggedAvatarId.current = null
    setDraggingAvatarId(null)
  }

  const cancelAvatarMove = () => {
    if (draggedAvatarId.current && avatarDragOrigin.current) {
      avatarDragPreview.current = avatarDragOrigin.current
      setAvatars(avatarDragOrigin.current)
    }
    avatarDragOrigin.current = null
    draggedAvatarId.current = null
    setDraggingAvatarId(null)
  }

  const cancelAvatarEditing = () => {
    const snapshot = avatarEditSnapshot.current
    if (!snapshot) {
      setBodyEditing(false)
      setMode('avatars')
      restoreStateAfterEditor()
      return
    }
    avatarEditSnapshot.current = null
    avatarsRef.current = snapshot.avatars
    setAvatars(snapshot.avatars)
    activateAvatar(snapshot.activeAvatarId, false, true)
    setMode('avatars')
    restoreStateAfterEditor()
  }

  const saveAvatarEditing = () => {
    avatarEditSnapshot.current = null
    updateStudioLibrary({ activeAvatarId: activeAvatarIdRef.current, avatars: avatarsRef.current })
    setBodyEditing(false)
    restoreStateAfterEditor()
  }

  const renameActiveAvatar = (name: string) => {
    updateActiveAvatar(avatar => ({ ...avatar, name }))
  }

  const deleteActiveAvatar = () => {
    if (avatarsRef.current.length <= 1) return
    avatarEditSnapshot.current = null
    const remaining = avatarsRef.current.filter(avatar => avatar.id !== activeAvatarIdRef.current)
    avatarsRef.current = remaining
    setAvatars(remaining)
    updateStudioLibrary({ activeAvatarId: remaining[0].id, avatars: remaining })
    setDeleteAvatarOpen(false)
    activateAvatar(remaining[0].id)
    restoreStateAfterEditor()
  }

  const addBodyNode = (type: (typeof bodyPrimitiveTypes)[number]) => {
    if (bodyNodesRef.current.length >= MAX_BODY_NODES) return
    const node = createBodyNode(type, bodyNodesRef.current.length)
    updateBodyNodes([...bodyNodesRef.current, node])
    selectBodyNode(node.id)
  }

  const updateSelectedBodyNode = (update: (node: BodyNode) => BodyNode) => {
    if (selectedBodyNodeId === 'primary') return
    updateBodyNodes(
      bodyNodesRef.current.map(node => (node.id === selectedBodyNodeId ? update(node) : node))
    )
  }

  const commitBodyNode = (nextNode: BodyNode) => {
    updateBodyNodes(bodyNodesRef.current.map(node => (node.id === nextNode.id ? nextNode : node)))
  }

  const previewSelectedBodyNode = (nextNode: BodyNode) => {
    const next = bodyNodesRef.current.map(node => (node.id === nextNode.id ? nextNode : node))
    bodyNodesRef.current = next
    setBodyNodes(next)
    paintPose(displayedPose.current)
  }

  const deleteSelectedBodyNode = () => {
    if (selectedBodyNodeId === 'primary') return
    updateBodyNodes(bodyNodesRef.current.filter(node => node.id !== selectedBodyNodeId))
    selectBodyNode('primary')
  }

  const duplicateSelectedBodyNode = () => {
    if (selectedBodyNodeId === 'primary' || bodyNodesRef.current.length >= MAX_BODY_NODES) return
    const source = bodyNodesRef.current.find(node => node.id === selectedBodyNodeId)
    if (!source) return
    const duplicate = duplicateBodyNode(source)
    updateBodyNodes([...bodyNodesRef.current, duplicate])
    selectBodyNode(duplicate.id)
  }

  const updateHighlight = (next: Highlight) => {
    if (next && statePlaying) pauseState()
    highlightRef.current = next
    setHighlight(next)
    if (next === 'head') paintPose(displayedPose.current)
  }

  const updateWireVisibility = (next: boolean) => {
    showWireRef.current = next
    setShowWire(next)
    if (next) paintPose(displayedPose.current)
  }

  const clearStateTimers = () => {
    if (stateTimer.current) clearTimeout(stateTimer.current)
    if (blinkTimer.current) clearTimeout(blinkTimer.current)
    if (autonomousExpressionTimer.current) clearTimeout(autonomousExpressionTimer.current)
    if (autonomousActionTimer.current) clearTimeout(autonomousActionTimer.current)
    if (autonomousActionStepTimer.current) clearTimeout(autonomousActionStepTimer.current)
    stateTimer.current = null
    blinkTimer.current = null
    autonomousExpressionTimer.current = null
    autonomousActionTimer.current = null
    autonomousActionStepTimer.current = null
    autonomousActionActive.current = false
    playbackTimeline.current = {
      ...playbackTimeline.current,
      stepDueAt: null,
      blinkDueAt: null,
    }
  }

  const pauseState = (persist = true) => {
    playbackTimeline.current = pausePlaybackTimeline(playbackTimeline.current, readSequenceClock())
    if (transitionFrame.current !== null && activeSequenceTransition.current) {
      cancelAnimationFrame(transitionFrame.current)
      transitionFrame.current = null
      pausedSequenceTransition.current = activeSequenceTransition.current
      activeSequenceTransition.current = null
    }
    if (blinkAnimating.current) blinkControls.current?.pause()
    clearStateTimers()
    if (activeSequenceRef.current?.driver) updateCursorFollowEnabled(false)
    setStatePlaying(false)
    setPlaybackStatus('paused')
    if (persist && activeState) persistStatePlayback({ stateId: activeState, playing: false })
  }

  const stopState = (persist = true) => {
    clearStateTimers()
    updateCursorFollowEnabled(false)
    playbackTimeline.current = stopPlaybackTimeline(playbackTimeline.current)
    activeSequenceTransition.current = null
    pausedSequenceTransition.current = null
    stopTransition(true)
    blinkControls.current?.stop()
    blinkAnimating.current = false
    blinkValue.jump(1)
    activeGazeProfileRef.current = null
    lastRenderedGaze.current = null
    gazeBlendFrom.current = null
    gazeBlendStartedAt.current = -1
    gazeRelease.current = null
    deferredFaceForward.current = null
    gazeStartedAt.current = -1
    lastGazeElapsed.current = 0
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    updateActiveFaceForward(manualGazeTargetRef.current ? false : Boolean(avatar?.faceForward))
    paintPose(displayedPose.current, 1)
    setStatePlaying(false)
    setPlaybackStatus('stopped')
    setPlaybackVisual(current => ({ ...current, position: null }))
    if (persist) persistStatePlayback({ stateId: null, playing: false })
  }

  const startAutonomousPlayback = (sequence: AvatarSequence) => {
    const isActive = () =>
      activeSequenceRef.current?.id === sequence.id && cursorFollowActiveRef.current
    const expressionPool = sequence.steps.flatMap(step => {
      const index = findExpressionIndex(expressionsRef.current, step.expressionId)
      return index >= 0 ? [{ expression: expressionsRef.current[index], index }] : []
    })
    if (!expressionPool.length) return

    const scheduleExpression = (delay = randomBetween(1700, 3300)) => {
      autonomousExpressionTimer.current = setTimeout(() => {
        if (!isActive()) return
        if (autonomousActionActive.current) {
          scheduleExpression(650)
          return
        }
        const previous = autonomousExpressionId.current
        const next = pickDifferent(
          expressionPool.map(item => item.expression.id),
          previous
        )
        const selected =
          expressionPool.find(item => item.expression.id === next) ?? expressionPool[0]
        autonomousExpressionId.current = selected.expression.id
        transitionToExpression(selected.expression, selected.index, {
          transitionMs: Math.round(randomBetween(620, 980)),
          transition: 'smooth',
        })
        scheduleExpression()
      }, delay)
    }

    const scheduleAction = (delay = randomBetween(5200, 9200)) => {
      autonomousActionTimer.current = setTimeout(() => {
        if (!isActive()) return
        const availableActions = AUTONOMOUS_ACTION_IDS.flatMap(id => {
          const action = sequencesRef.current.find(item => item.id === id)
          return action ? [action] : []
        })
        const action = pickDifferent(availableActions, null)
        if (!action) {
          scheduleAction()
          return
        }
        autonomousActionActive.current = true
        const actionSteps = action.steps.slice(1, -1)
        let actionPosition = 0
        const playActionStep = () => {
          if (!isActive()) return
          const step = actionSteps[actionPosition]
          if (!step) {
            const resting =
              expressionPool.find(item => item.expression.id === autonomousExpressionId.current) ??
              expressionPool[0]
            transitionToExpression(resting.expression, resting.index, {
              transitionMs: 720,
              transition: 'smooth',
            })
            autonomousActionStepTimer.current = setTimeout(() => {
              if (!isActive()) return
              autonomousActionActive.current = false
              scheduleAction()
            }, 720)
            return
          }
          const expressionIndex = findExpressionIndex(expressionsRef.current, step.expressionId)
          const expression = expressionsRef.current[expressionIndex]
          if (expression) transitionToExpression(expression, expressionIndex, step)
          actionPosition += 1
          autonomousActionStepTimer.current = setTimeout(
            playActionStep,
            step.transitionMs + step.holdMs
          )
        }
        playActionStep()
      }, delay)
    }

    const initial = pickDifferent(
      expressionPool.map(item => item.expression.id),
      null
    )
    const initialSelection =
      expressionPool.find(item => item.expression.id === initial) ?? expressionPool[0]
    autonomousExpressionId.current = initialSelection.expression.id
    transitionToExpression(initialSelection.expression, initialSelection.index, {
      transitionMs: 760,
      transition: 'smooth',
    })
    scheduleExpression()
    scheduleAction()
  }

  const launchSequence = (sequence: AvatarSequence, resume = false, persist = true) => {
    clearStateTimers()
    if (!sequence.steps.length) {
      stopState(persist)
      return
    }
    const playbackAvatar =
      avatarsRef.current.find(item => item.id === activeAvatarIdRef.current) ?? activeAvatar
    const previousSequence = activeSequenceRef.current
    const switchingSequence = !resume && previousSequence?.id !== sequence.id
    const cursorWasActive = cursorFollowActiveRef.current
    const entryTransitionMs = Math.max(sequence.steps[0]?.transitionMs ?? 500, 680)
    const previousGazeProfile = activeGazeProfileRef.current
    const requestedGazeProfile = resolveSequenceGazeProfile(sequence)
    // Authored actions opt out of live gaze so a second head rig cannot fight
    // their keyframes and create apparent jitter.
    const nextGazeProfile = requestedGazeProfile
    if (!resume && previousGazeProfile !== nextGazeProfile) {
      gazeBlendFrom.current = lastRenderedGaze.current
      gazeBlendStartedAt.current = -1
      gazeStartedAt.current = -1
      lastGazeElapsed.current = 0
    }
    activeGazeProfileRef.current = nextGazeProfile
    setTalking(false)
    setThinking(false)
    if (playbackAvatar.logoMorph) setLogoFace(sequence.presentation !== 'logo')
    const nextFaceForward = resolveSequenceFaceForward(playbackAvatar.faceForward, sequence)
    if (
      cursorWasActive &&
      sequence.presentation === 'logo' &&
      playbackAvatar.logoMorph &&
      faceReveal.get() > 0.001
    ) {
      // Keep the visible face attached to its current 3D pose while it fades out.
      // Switching to the logo's locked-face mode before the fade begins produces
      // a one-frame eye/head snap even when the gaze itself is interpolated.
      deferredFaceForward.current = nextFaceForward
    } else {
      deferredFaceForward.current = null
      updateActiveFaceForward(nextFaceForward)
    }
    activeSequenceRef.current = sequence
    updateCursorFollowEnabled(
      Boolean(sequence.driver),
      switchingSequence ? entryTransitionMs : undefined
    )
    paintPose(displayedPose.current, undefined, performance.now())
    const id = sequence.id
    playbackTimeline.current = beginPlayback(playbackTimeline.current, resume)
    setSelectedState(id)
    setActiveState(id)
    setStatePlaying(true)
    setPlaybackStatus('playing')
    if (persist) persistStatePlayback({ stateId: id, playing: true })
    const scheduleAdvance = (delay: number) => {
      playbackTimeline.current = schedulePlaybackStep(
        playbackTimeline.current,
        readSequenceClock(),
        delay
      )
      stateTimer.current = setTimeout(advance, delay)
    }
    let enteringSequence = switchingSequence
    const playCurrentStep = () => {
      playbackTimeline.current = { ...playbackTimeline.current, stepDueAt: null }
      const step = sequence.steps[playbackTimeline.current.position]
      const availableExpressions = expressionsRef.current
      const expressionIndex = findExpressionIndex(availableExpressions, step.expressionId)
      const preset = availableExpressions[expressionIndex]
      const transitionSettings = enteringSequence
        ? {
            ...step,
            transitionMs: Math.max(step.transitionMs, 680),
            transition: 'smooth' as const,
          }
        : step
      enteringSequence = false
      const durationMs = (reduceMotion ? 0 : transitionSettings.transitionMs) + step.holdMs
      setPlaybackVisual(current => ({
        position: playbackTimeline.current.position,
        run: current.run + 1,
        durationMs,
      }))
      if (preset) {
        transitionToExpression(preset, expressionIndex, transitionSettings)
      }
      scheduleAdvance(durationMs)
    }
    const advance = () => {
      const advanced = advancePlaybackTimeline(playbackTimeline.current, sequence)
      playbackTimeline.current = advanced.timeline
      const { cursor } = advanced
      if (cursor.complete) {
        if (blinkTimer.current) clearTimeout(blinkTimer.current)
        blinkTimer.current = null
        playbackTimeline.current = { ...playbackTimeline.current, blinkDueAt: null }
        const retainLiveGaze = sequence.group === 'Animations'
        if (!retainLiveGaze) {
          activeGazeProfileRef.current = null
          gazeStartedAt.current = -1
          lastGazeElapsed.current = 0
          updateActiveFaceForward(Boolean(playbackAvatar.faceForward))
        }
        paintPose(displayedPose.current)
        setStatePlaying(false)
        setPlaybackStatus('stopped')
        setPlaybackVisual(current => ({ ...current, position: null }))
        if (persist) persistStatePlayback({ stateId: null, playing: false })
        return
      }
      playCurrentStep()
    }
    const scheduleBlink = (delay: number) => {
      playbackTimeline.current = schedulePlaybackBlink(
        playbackTimeline.current,
        readSequenceClock(),
        delay
      )
      blinkTimer.current = setTimeout(blinkLoop, delay)
    }
    const blinkLoop = () => {
      playbackTimeline.current = { ...playbackTimeline.current, blinkDueAt: null }
      blink(sequence.blink.durationMs)
      const { minIntervalMs, maxIntervalMs } = sequence.blink
      scheduleBlink(
        sequence.blink.durationMs + minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs)
      )
    }
    if (sequence.driver) {
      setPlaybackVisual(current => ({ position: 0, run: current.run + 1, durationMs: 0 }))
      if (sequence.driver === 'cursor') {
        const firstStep = sequence.steps[0]
        const expressionIndex = firstStep
          ? findExpressionIndex(expressionsRef.current, firstStep.expressionId)
          : -1
        const preset = expressionsRef.current[expressionIndex]
        if (preset && firstStep) transitionToExpression(preset, expressionIndex, firstStep)
      } else {
        startAutonomousPlayback(sequence)
      }
      if (sequence.blink.enabled) scheduleBlink(sequence.blink.initialDelayMs)
      return
    }
    if (resume) {
      const pausedTransition = pausedSequenceTransition.current
      if (pausedTransition) {
        transitionToExpression(pausedTransition.target, pausedTransition.index, {
          ...pausedTransition.settings,
          transitionMs: pausedTransition.remainingMs,
        })
        pausedSequenceTransition.current = null
      }
      if (blinkAnimating.current) blinkControls.current?.play()
      const currentStep = sequence.steps[playbackTimeline.current.position]
      scheduleAdvance(
        playbackTimeline.current.stepRemainingMs ||
          (reduceMotion ? 0 : currentStep.transitionMs) + currentStep.holdMs
      )
    } else {
      playCurrentStep()
    }
    if (sequence.blink.enabled) {
      scheduleBlink(
        resume
          ? playbackTimeline.current.blinkRemainingMs || sequence.blink.initialDelayMs
          : sequence.blink.initialDelayMs
      )
    }
  }

  const toggleStatePlayback = () => {
    if (!activeState || !activeSequenceRef.current) return
    if (statePlaying) pauseState()
    else launchSequence(activeSequenceRef.current, playbackStatus === 'paused')
  }

  const suspendStateForEditor = () => {
    if (editorStateSnapshot.current || !activeState) return
    editorStateSnapshot.current = {
      stateId: activeState,
      playing: statePlaying,
      expression: { ...displayedPose.current.expression },
    }
    if (statePlaying) pauseState(false)
    activeGazeProfileRef.current = null
    setActiveState(null)
  }

  const restoreStateAfterEditor = (availableSequences = sequences) => {
    const snapshot = editorStateSnapshot.current
    editorStateSnapshot.current = null
    if (!snapshot) return
    const sequence = availableSequences.find(item => item.id === snapshot.stateId)
    if (!sequence) {
      stopState(false)
      persistStatePlayback({ stateId: null, playing: false })
      return
    }
    activeSequenceRef.current = sequence
    activeGazeProfileRef.current = resolveSequenceGazeProfile(sequence)
    gazeStartedAt.current = -1
    setSelectedState(sequence.id)
    setActiveState(sequence.id)
    const playbackAvatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    updateActiveFaceForward(resolveSequenceFaceForward(playbackAvatar?.faceForward, sequence))
    if (snapshot.playing) {
      launchSequence(sequence, true, false)
      return
    }
    setStatePlaying(false)
    transitionToExpression(snapshot.expression)
  }

  useEffect(() => {
    if (initialStatePlaybackApplied.current) return
    initialStatePlaybackApplied.current = true
    const sequence = sequences.find(item => item.id === selectedState)
    if (sequence && initialStatePlayback.stateId !== null) {
      activeSequenceRef.current = sequence
      activeGazeProfileRef.current = resolveSequenceGazeProfile(sequence)
      setActiveState(sequence.id)
      updateActiveFaceForward(resolveSequenceFaceForward(initialAvatar.faceForward, sequence))
      if (initialStatePlayback.playing) launchSequence(sequence, false, false)
      else setPlaybackStatus('paused')
    }
    return () => {
      initialStatePlaybackApplied.current = false
    }
  }, [])

  const saveEditing = () => {
    if (!editing) return
    const index = editing.index ?? expressions.length
    const savedDraft =
      editing.index === null ? { ...editing.draft, id: createExpressionId() } : editing.draft
    const next =
      editing.index === null
        ? [...expressions, savedDraft]
        : expressions.map((item, itemIndex) =>
            itemIndex === editing.index ? { ...savedDraft } : item
          )
    setExpressions(next)
    updateStudioExpressions(next)
    setEditing(null)
    transitionToExpression(savedDraft, index)
    if (!sequenceEditing) restoreStateAfterEditor()
  }

  const duplicateExpression = (_index: number | null, draft: Expression, editDuplicate = false) => {
    const duplicate = { ...draft, id: createExpressionId() }
    const next = [...expressions, duplicate]
    const duplicateIndex = next.length - 1
    setExpressions(next)
    updateStudioExpressions(next)
    if (editDuplicate) openExpressionEditor(duplicateIndex, duplicate)
    else transitionToExpression(duplicate, duplicateIndex)
  }

  const previewExpressionMove = (targetId: string | null) => {
    const draggedId = draggedExpressionId.current
    if (!draggedId || draggedId === targetId) return
    const current = expressionDragPreview.current
    const dragged = current.find(item => item.id === draggedId)
    if (!dragged) return
    const activeId = activeExpression === null ? null : current[activeExpression]?.id
    const next = current.filter(item => item.id !== draggedId)
    const targetIndex = targetId ? next.findIndex(item => item.id === targetId) : next.length
    next.splice(targetIndex < 0 ? next.length : targetIndex, 0, dragged)
    expressionDragPreview.current = next
    setExpressions(next)
    if (activeId) setActiveExpression(next.findIndex(item => item.id === activeId))
  }

  const commitExpressionMove = (targetId: string | null) => {
    previewExpressionMove(targetId)
    updateStudioExpressions(expressionDragPreview.current)
    expressionDragOrigin.current = null
    draggedExpressionId.current = null
    setDraggingExpressionId(null)
  }

  const cancelExpressionMove = () => {
    if (draggedExpressionId.current && expressionDragOrigin.current) {
      expressionDragPreview.current = expressionDragOrigin.current
      setExpressions(expressionDragOrigin.current)
    }
    expressionDragOrigin.current = null
    draggedExpressionId.current = null
    setDraggingExpressionId(null)
  }

  const previewExpressionDraft = (draft: Expression) => {
    setEditing(current => (current ? { ...current, draft } : current))
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (avatar) setDisplayColors(resolveColors(draft, avatar.colors))
    paintPose(poseFromExpression(draft))
  }

  const previewCanvasExpression = (next: Expression, target: CanvasPreviewTarget) => {
    const now = performance.now()
    const updateInspector = now - lastInspectorFrame.current >= INSPECTOR_FRAME_MS
    if (updateInspector) {
      lastInspectorFrame.current = now
      if (editing) {
        setEditing(current => (current ? { ...current, draft: next } : current))
      } else {
        setExpression(next)
      }
    }
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (bodyEditing) {
      paintRenderedRotationGizmo(renderedRotationGizmo, next)
      paintRenderedScene(
        renderedScene,
        renderAvatar(
          poseFromExpression(
            resolveCanvasPreviewExpression(next, activeAvatarEyes, bodyEditing, target)
          ),
          surfaceRef.current,
          blinkValue.get(),
          {
            includeWire: showWireRef.current || highlightRef.current === 'head',
            bodyNodes: bodyNodesRef.current,
            mouth: avatar?.mouth,
            faceForward: avatar?.faceForward,
          }
        )
      )
      return
    }
    if (avatar) setDisplayColors(resolveColors(next, avatar.colors))
    paintPose(poseFromExpression(next))
  }

  const openExpressionEditor = (index: number | null, draft: Expression) => {
    suspendStateForEditor()
    setBodyEditing(false)
    setMode('expressions')
    setEditing({
      index,
      draft: { ...draft, id: index === null ? createExpressionId() : draft.id },
    })
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (avatar) setDisplayColors(resolveColors(draft, avatar.colors))
    paintPose(poseFromExpression(draft))
  }

  const cancelExpressionEditing = () => {
    setEditing(null)
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (avatar) setDisplayColors(resolveColors(expression, avatar.colors))
    paintPose(poseFromExpression(expression))
    if (!sequenceEditing) restoreStateAfterEditor()
  }

  const deleteEditing = () => {
    if (editing?.index === null || editing?.index === undefined) return
    const next =
      expressions.length <= 1
        ? [{ ...defaultExpression }]
        : expressions.filter((_, index) => index !== editing.index)
    const fallback = next[Math.min(editing.index, next.length - 1)] ?? defaultExpression
    const deletedExpressionId = expressions[editing.index]?.id ?? editing.draft.id
    const fallbackExpressionId = fallback.id
    const nextSequences = remapSequencesAfterExpressionDelete(
      sequences,
      deletedExpressionId,
      fallbackExpressionId
    )
    setExpressions(next)
    setSequences(nextSequences)
    if (sequenceEditing) {
      const draft = remapSequencesAfterExpressionDelete(
        [sequenceEditing.draft],
        deletedExpressionId,
        fallbackExpressionId
      )[0]
      setSequenceEditing({ ...sequenceEditing, draft })
    }
    updateStudioExpressions(next)
    updateStudioSequences(nextSequences)
    setActiveExpression(null)
    setEditing(null)
    setDeleteExpressionOpen(false)
    setExpression(fallback)
    const avatar = avatarsRef.current.find(item => item.id === activeAvatarIdRef.current)
    if (avatar) setDisplayColors(resolveColors(fallback, avatar.colors))
    paintPose(poseFromExpression(fallback))
    if (!sequenceEditing) restoreStateAfterEditor()
  }

  const openSequenceEditor = (sequence?: AvatarSequence) => {
    suspendStateForEditor()
    setEditing(null)
    setBodyEditing(false)
    setMode('states')
    const draft = sequence
      ? {
          ...sequence,
          steps: sequence.steps.map(step => ({ ...step })),
          blink: { ...sequence.blink },
        }
      : createSequence(expressions[activeExpression ?? 0]?.id ?? expressions[0]?.id)
    setSequenceEditing({ sourceId: sequence?.id ?? null, draft })
    setSelectedSequenceStepId(draft.steps[0]?.id ?? null)
    const firstStep = draft.steps[0]
    const expressionIndex = firstStep
      ? findExpressionIndex(expressions, firstStep.expressionId)
      : -1
    const preset = expressions[expressionIndex]
    if (preset) transitionToExpression(preset, expressionIndex, firstStep)
  }

  const cancelSequenceEditing = () => {
    if (activeState === sequenceEditing?.draft.id) stopState(false)
    setSequenceEditing(null)
    setSelectedSequenceStepId(null)
    restoreStateAfterEditor()
  }

  const saveSequenceEditing = () => {
    if (!sequenceEditing?.draft.steps.length || !sequenceEditing.draft.name.trim()) return
    const saved = {
      ...sequenceEditing.draft,
      name: sequenceEditing.draft.name.trim(),
      group: sequenceEditing.draft.group.trim() || 'Custom',
    }
    const next = sequenceEditing.sourceId
      ? sequences.map(sequence => (sequence.id === sequenceEditing.sourceId ? saved : sequence))
      : [...sequences, saved]
    setSequences(next)
    updateStudioSequences(next)
    setSelectedState(saved.id)
    if (activeState === saved.id) stopState(false)
    setSequenceEditing(null)
    setSelectedSequenceStepId(null)
    restoreStateAfterEditor(next)
  }

  const duplicateSequenceEditing = () => {
    if (!sequenceEditing) return
    if (activeState === sequenceEditing.draft.id) stopState(false)
    const duplicate = duplicateSequence(sequenceEditing.draft)
    const next = [...sequences, duplicate]
    setSequences(next)
    updateStudioSequences(next)
    setSelectedState(duplicate.id)
    setSequenceEditing({ sourceId: duplicate.id, draft: duplicate })
    setSelectedSequenceStepId(duplicate.steps[0]?.id ?? null)
  }

  const duplicateState = (sequence: AvatarSequence) => {
    if (activeState === sequence.id) stopState(false)
    const duplicate = duplicateSequence(sequence)
    const next = [...sequences, duplicate]
    setSequences(next)
    updateStudioSequences(next)
    setSelectedState(duplicate.id)
  }

  const previewStateMove = (targetId: string | null, targetGroup: string) => {
    const draggedId = draggedStateId.current
    if (!draggedId || draggedId === targetId) return
    const current = stateDragPreview.current
    const dragged = current.find(sequence => sequence.id === draggedId)
    if (!dragged) return
    const next = current.filter(sequence => sequence.id !== draggedId)
    const moved = { ...dragged, group: targetGroup }
    if (targetId) {
      const targetIndex = next.findIndex(sequence => sequence.id === targetId)
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, moved)
    } else {
      let lastGroupIndex = -1
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index].group !== targetGroup) continue
        lastGroupIndex = index
        break
      }
      next.splice(lastGroupIndex + 1, 0, moved)
    }
    stateDragPreview.current = next
    setSequences(next)
  }

  const commitStateMove = (targetId: string | null, targetGroup: string) => {
    previewStateMove(targetId, targetGroup)
    updateStudioSequences(stateDragPreview.current)
    stateDragOrigin.current = null
    draggedStateId.current = null
    setDraggingStateId(null)
  }

  const cancelStateMove = () => {
    if (draggedStateId.current && stateDragOrigin.current) {
      stateDragPreview.current = stateDragOrigin.current
      setSequences(stateDragOrigin.current)
    }
    stateDragOrigin.current = null
    draggedStateId.current = null
    setDraggingStateId(null)
  }

  const deleteSequenceEditing = () => {
    if (!sequenceEditing?.sourceId) return
    const next = sequences.filter(sequence => sequence.id !== sequenceEditing.sourceId)
    const fallback = next[0]
    setSequences(next)
    updateStudioSequences(next)
    if (activeState === sequenceEditing.sourceId) stopState(false)
    setSelectedState(fallback?.id ?? '')
    setSequenceEditing(null)
    setSelectedSequenceStepId(null)
    setDeleteSequenceOpen(false)
    restoreStateAfterEditor(next)
  }

  const selectedBodyNode =
    selectedBodyNodeId === 'primary'
      ? null
      : (bodyNodes.find(node => node.id === selectedBodyNodeId) ?? null)

  const updateNodeVector = (property: 'position' | 'rotation', index: 0 | 1 | 2, value: number) => {
    updateSelectedBodyNode(node => {
      const vector = [...node[property]] as [number, number, number]
      vector[index] = value
      return { ...node, [property]: vector }
    })
  }
  const activeAvatar = avatars.find(avatar => avatar.id === activeAvatarId) ?? avatars[0]
  const activeAvatarEyes = activeAvatar.eyes ?? defaultAvatarEyes
  const activeSequence = sequences.find(sequence => sequence.id === activeState) ?? null
  const activeStatusEffect =
    (playbackStatus !== 'stopped' ? activeSequence?.effect : undefined) ??
    (thinking ? 'thinking' : undefined)
  const activeSequenceLabel = activeSequence
    ? activeSequence.builtIn
      ? t(activeSequence.name)
      : activeSequence.name
    : null
  const expressionById = new Map(expressions.map(item => [item.id, item]))
  const exportAnimationIdSet = new Set(exportAnimationIds)
  const selectedExportAnimations = sequences.filter(animation =>
    exportAnimationIdSet.has(animation.id)
  )
  const toggleExportAnimation = (animationId: string) => {
    setExportAnimationIds(current =>
      current.includes(animationId)
        ? current.filter(id => id !== animationId)
        : [...current, animationId]
    )
  }
  const downloadAvatarExport = () => {
    if (!selectedExportAnimations.length) return
    const payload = createAvatarExportPayload(activeAvatar, expressions, selectedExportAnimations)
    const isReact = exportFormat === 'react'
    const extension = 'zip'
    const blob = isReact
      ? generateReactAvatarPackage(payload)
      : generateJavaScriptAvatarPackage(payload, language)
    downloadBlob(blob, avatarExportFileName(activeAvatar.name, extension))
  }
  const currentStudioDocument = (): StudioDocument => ({
    version: 2,
    library: {
      activeAvatarId,
      avatars,
      ...(bundledAvatarRevision ? { bundledAvatarRevision } : {}),
    },
    expressions: baseBehavior.expressions,
    sequences: baseBehavior.sequences,
    playback: {
      stateId: playbackStatus === 'stopped' ? null : (activeState ?? (selectedState || null)),
      playing: statePlaying,
    },
  })
  const downloadStudioProject = () => {
    const blob = new Blob([serializeStudioDocument(currentStudioDocument())], {
      type: 'application/json',
    })
    downloadBlob(blob, 'avatar-studio-project.json')
  }
  const currentSnapshotSvg = () =>
    serializeAvatarSnapshot(
      activeAvatar.name,
      renderedScene,
      {
        body: renderedColors.body.get(),
        eyes: renderedColors.eyes.get(),
      },
      {
        background: snapshotBackground,
        colorFrom: snapshotColorFrom,
        colorTo: snapshotColorTo,
        size: Number(snapshotSize),
      },
      activeAvatar.mouth,
      activeAvatar,
      faceReveal.get()
    )

  const downloadSnapshotSvg = () => {
    downloadBlob(
      new Blob([currentSnapshotSvg()], { type: 'image/svg+xml;charset=utf-8' }),
      snapshotFileName(activeAvatar.name)
    )
  }
  const downloadSnapshotPng = () => {
    const size = Number(snapshotSize)
    const source = new Blob([currentSnapshotSvg()], { type: 'image/svg+xml;charset=utf-8' })
    const sourceUrl = URL.createObjectURL(source)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      canvas.getContext('2d')?.drawImage(image, 0, 0, size, size)
      URL.revokeObjectURL(sourceUrl)
      canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, snapshotFileName(activeAvatar.name, 'png'))
      }, 'image/png')
    }
    image.onerror = () => URL.revokeObjectURL(sourceUrl)
    image.src = sourceUrl
  }
  const takePicture = () => {
    setPhotoFlash(current => current + 1)
    requestAnimationFrame(() => {
      if (snapshotFormat === 'png') downloadSnapshotPng()
      else downloadSnapshotSvg()
    })
  }
  const toggleTalking = () => {
    if (!activeAvatar.mouth) return
    setTalking(current => {
      const next = !current
      if (next) {
        setThinking(false)
        revealLogoFace()
      }
      return next
    })
  }
  const toggleThinking = () => {
    if (!activeAvatar.mouth && !activeAvatar.logoMorph) return
    setThinking(current => {
      const next = !current
      if (next) {
        setTalking(false)
        revealLogoFace()
      }
      return next
    })
  }
  const setLogoFace = (revealed: boolean) => {
    if (!activeAvatar.logoMorph) return
    faceRevealAnimation.current?.stop()
    setFaceRevealed(revealed)
    if (!revealed) {
      setTalking(false)
      setThinking(false)
    }
    faceRevealAnimation.current = animate(faceReveal, revealed ? 1 : 0, {
      duration: reduceMotion ? 0 : 0.62,
      ease: [0.22, 1, 0.36, 1],
    })
  }
  const revealLogoFace = () => {
    if (activeAvatar.logoMorph && !faceRevealed) setLogoFace(true)
  }
  const toggleLogoFace = () => setLogoFace(!faceRevealed)
  const prepareStudioProjectImport = (file: File | undefined) => {
    if (!file) return
    setProjectImportError(null)
    if (file.size > 10_000_000) {
      setProjectImportError(
        t('Ce fichier ne contient pas un projet Avatar Studio valide et compatible.')
      )
      return
    }
    file
      .text()
      .then(source => {
        const imported = parseImportedStudioDocument(source, currentStudioDocument())
        setPendingProjectImport({ document: imported, fileName: file.name })
      })
      .catch(() => {
        setProjectImportError(
          t('Ce fichier ne contient pas un projet Avatar Studio valide et compatible.')
        )
      })
  }
  const confirmStudioProjectImport = () => {
    if (!pendingProjectImport) return
    if (!persistStudioDocument(pendingProjectImport.document)) {
      setProjectImportError(
        t(
          'Le projet n’a pas pu être enregistré dans ce navigateur. Libère de l’espace puis réessaie.'
        )
      )
      setPendingProjectImport(null)
      return
    }
    window.location.reload()
  }
  const canvasExpression = editing?.draft ?? expression
  const editorPageOpen = bodyEditing || editing !== null || sequenceEditing !== null
  const expressionPendingDeletionId =
    editing?.index !== null && editing?.index !== undefined
      ? (expressions[editing.index]?.id ?? editing.draft.id)
      : null
  const animationsAffectedByExpressionDeletion = expressionPendingDeletionId
    ? sequences.filter(sequence =>
        sequence.steps.some(step => step.expressionId === expressionPendingDeletionId)
      )
    : []

  useEffect(() => {
    if (!editorPageOpen || focusAvatarName) return
    const frame = requestAnimationFrame(() => workspaceBackButtonRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [editorPageOpen, focusAvatarName])

  const updateAvatarEyeDimension = (side: Side, dimension: 'width' | 'height', value: number) => {
    const next = updateEyeDimension(
      { ...defaultExpression, ...activeAvatarEyes },
      side,
      dimension,
      value,
      linked[dimension]
    )
    updateAvatarEyes({
      [`${dimension}Left`]: next[`${dimension}Left`],
      [`${dimension}Right`]: next[`${dimension}Right`],
    })
  }
  const updateAvatarEyeSize = (side: Side, value: number) => {
    const next = scaleEye({ ...defaultExpression, ...activeAvatarEyes }, side, value, linked.size)
    updateAvatarEyes({
      widthLeft: next.widthLeft,
      widthRight: next.widthRight,
      heightLeft: next.heightLeft,
      heightRight: next.heightRight,
    })
  }
  const updateAvatarEyePosition = (side: Side, axis: 'X' | 'Y', value: number) => {
    const next = updateEyePosition(
      { ...defaultExpression, ...activeAvatarEyes },
      side,
      axis,
      value,
      linked.position
    )
    updateAvatarEyes({
      [`position${axis}Left`]: next[`position${axis}Left`],
      [`position${axis}Right`]: next[`position${axis}Right`],
    })
  }
  const persistEditedEyeExpression = (next: Expression) => {
    updateAvatarEyes({
      widthLeft: next.widthLeft,
      widthRight: next.widthRight,
      heightLeft: next.heightLeft,
      heightRight: next.heightRight,
      spacing: next.spacing,
      positionXLeft: next.positionXLeft,
      positionXRight: next.positionXRight,
      positionYLeft: next.positionYLeft,
      positionYRight: next.positionYRight,
      leftAngle: next.leftAngle,
      rightAngle: next.rightAngle,
    })
  }
  return {
    activateAvatar,
    activeAvatar,
    activeAvatarEyes,
    activeAvatarId,
    activeFaceForward,
    activeExpression,
    activeSequence,
    activeSequenceLabel,
    activeStatusEffect,
    activeState,
    addBodyNode,
    animationsAffectedByExpressionDeletion,
    avatarDragOrigin,
    avatarDragPreview,
    avatars,
    avatarsRef,
    blink,
    bodyEditing,
    bodyNodes,
    cancelAvatarEditing,
    cancelAvatarMove,
    cancelExpressionEditing,
    cancelExpressionMove,
    cancelSequenceEditing,
    cancelStateMove,
    canvasExpression,
    commitAvatarMove,
    commitBodyNode,
    commitExpressionMove,
    commitStateMove,
    confirmStudioProjectImport,
    createNewAvatar,
    cursorFollowActive,
    deleteActiveAvatar,
    deleteAvatarOpen,
    deleteEditing,
    deleteExpressionOpen,
    deleteSelectedBodyNode,
    deleteSequenceEditing,
    deleteSequenceOpen,
    downloadAvatarExport,
    downloadStudioProject,
    draggedAvatarId,
    draggedExpressionId,
    draggedStateId,
    draggingAvatarId,
    draggingExpressionId,
    draggingStateId,
    duplicateAvatar,
    duplicateExpression,
    duplicateSelectedBodyNode,
    duplicateSequenceEditing,
    duplicateState,
    editing,
    editorPageOpen,
    exportAnimationIdSet,
    exportFormat,
    expression,
    faceReveal,
    faceRevealed,
    expressionById,
    expressionDragOrigin,
    expressionDragPreview,
    expressions,
    focusAvatarName,
    freezeLivePreviewForManipulation,
    highlight,
    language,
    launchSequence,
    linked,
    manualGazeTarget,
    mode,
    openExpressionEditor,
    openSequenceEditor,
    pauseState,
    pendingProjectImport,
    persistEditedEyeExpression,
    photoFlash,
    playbackStatus,
    playbackVisual,
    prepareStudioProjectImport,
    previewAvatarMove,
    previewCanvasExpression,
    previewExpressionDraft,
    previewExpressionMove,
    previewSelectedBodyNode,
    previewStateMove,
    projectImportError,
    projectImportRef,
    reduceMotion,
    renameActiveAvatar,
    renderedColors,
    renderedRotationGizmo,
    renderedScene,
    saveAvatarEditing,
    saveEditing,
    saveSequenceEditing,
    selectBodyNode,
    selectedBodyNode,
    selectedBodyNodeId,
    selectedExportAnimations,
    selectedEyeSide,
    selectedSequenceStepId,
    selectedState,
    sequenceEditing,
    sequences,
    setDeleteAvatarOpen,
    setDeleteExpressionOpen,
    setDeleteSequenceOpen,
    setCursorGazeTarget,
    setDraggingAvatarId,
    setDraggingExpressionId,
    setDraggingStateId,
    setEditing,
    setExportAnimationIds,
    setExportFormat,
    setFocusAvatarName,
    setLanguage,
    setLinked,
    setMode,
    setManualGazeTarget,
    setPendingProjectImport,
    setSelectedEyeSide,
    setSelectedSequenceStepId,
    setSequenceEditing,
    setSnapshotBackground,
    setSnapshotColorFrom,
    setSnapshotColorTo,
    setSnapshotFormat,
    setSnapshotSize,
    setSpringSpeed,
    setStatePlayerExpanded,
    showWire,
    snapshotBackground,
    snapshotColorFrom,
    snapshotColorTo,
    snapshotFormat,
    snapshotSize,
    springSpeed,
    springSpeedRef,
    stateDragOrigin,
    stateDragPreview,
    statePlayerExpanded,
    statePlaying,
    stopState,
    surface,
    t,
    takePicture,
    talking,
    thinking,
    toggleExportAnimation,
    toggleLogoFace,
    toggleTalking,
    toggleThinking,
    toggleStatePlayback,
    transitionToExpression,
    updateAvatarColors,
    updateAvatarEyeDimension,
    updateAvatarEyePosition,
    updateAvatarEyeSize,
    updateAvatarEyes,
    updateDimension,
    updateHighlight,
    updateImmediate,
    updateNodeVector,
    updateSelectedBodyNode,
    updateSize,
    updateSpacing,
    updateSurface,
    updateWireVisibility,
    workspaceBackButtonRef,
  }
}

export type StudioController = ReturnType<typeof useStudioController>
