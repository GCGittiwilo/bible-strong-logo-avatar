export const proceduralBrowserRuntime = `
const SVG_NS = 'http://www.w3.org/2000/svg';
const avatarInstanceId = () => typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const clamp01 = value => Math.max(0, Math.min(1, value));
const easeProgress = (progress, transition) => transition === 'smooth'
  ? progress * progress * (3 - 2 * progress)
  : transition === 'snappy'
    ? 1 - (1 - progress) ** 3
    : 1 - Math.exp(-6 * progress) * Math.cos(8 * progress);
const nearestAngle = (target, current) => {
  let resolved = target;
  while (resolved - current > 180) resolved -= 360;
  while (resolved - current < -180) resolved += 360;
  return resolved;
};
const resolvedTargetExpression = (target, current) => ({
  ...target,
  headX: nearestAngle(target.headX, current.headX),
  headY: nearestAngle(target.headY, current.headY),
  headZ: nearestAngle(target.headZ, current.headZ),
  leftAngle: nearestAngle(target.leftAngle, current.leftAngle),
  rightAngle: nearestAngle(target.rightAngle, current.rightAngle),
});
const colorChannels = color => {
  const value = color.replace('#', '');
  const hex = value.length === 3 ? value.split('').map(channel => channel + channel).join('') : value;
  const numeric = Number.parseInt(hex, 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
};
const interpolateColor = (from, to, progress) => {
  const left = colorChannels(from);
  const right = colorChannels(to);
  const value = left.map((channel, index) => Math.round(channel + (right[index] - channel) * progress));
  return '#' + value.map(channel => channel.toString(16).padStart(2, '0')).join('');
};
const resolveColors = expression => ({
  body: expression.bodyColor || DATA.avatar.colors.body,
  eyes: expression.eyeColor || DATA.avatar.colors.eyes,
});
const svgElement = name => document.createElementNS(SVG_NS, name);

function mountAvatar(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('Avatar target was not found.');
  const animationNames = Object.keys(DATA.animations);
  if (!animationNames.length) throw new Error('The avatar export contains no animations.');
  const instanceId = avatarInstanceId();
  const clipId = 'avatar-procedural-clip-' + instanceId;
  const svg = svgElement('svg');
  svg.setAttribute('viewBox', '-150 -150 300 300');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', DATA.avatar.name);
  svg.style.width = typeof options.size === 'number' ? options.size + 'px' : options.size || '100%';
  svg.style.height = typeof options.size === 'number' ? options.size + 'px' : options.size || '100%';
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const defs = svgElement('defs');
  const clipPath = svgElement('clipPath');
  const clipHead = svgElement('path');
  clipPath.id = clipId;
  clipPath.append(clipHead);
  defs.append(clipPath);
  svg.append(defs);
  const motionLayer = svgElement('g');
  const backLayer = svgElement('g');
  const head = svgElement('path');
  const eyesLayer = svgElement('g');
  const leftEye = svgElement('path');
  const rightEye = svgElement('path');
  const mouth = svgElement('path');
  const tongue = svgElement('path');
  const frontLayer = svgElement('g');
  const thoughtLayer = svgElement('g');
  const thoughtBubbleLayout = [[34, 29, 3], [25, 19, 5], [0, -6, 18]];
  const thoughtBubbles = thoughtBubbleLayout.map(() => svgElement('circle'));
  const thoughtDots = [-8, 0, 8].map(() => svgElement('circle'));
  eyesLayer.append(leftEye, rightEye, mouth, tongue);
  thoughtLayer.append(...thoughtBubbles, ...thoughtDots);
  motionLayer.append(backLayer, head, eyesLayer, frontLayer);
  svg.append(motionLayer, thoughtLayer);
  host.replaceChildren(svg);

  const logoCenterNodeIds = new Set(DATA.avatar.logoMorph?.centerNodeIds || []);
  const ensurePaths = (group, paths, fill, nodeIds) => {
    while (group.children.length < paths.length) group.append(svgElement('path'));
    while (group.children.length > paths.length) group.lastElementChild.remove();
    paths.forEach((path, index) => {
      const element = group.children[index];
      const morphing = logoCenterNodeIds.has(nodeIds?.[index]);
      element.setAttribute('d', path);
      element.setAttribute('fill', fill);
      element.style.opacity = morphing ? String(1 - faceProgress) : '1';
      element.style.transformBox = morphing ? 'fill-box' : '';
      element.style.transformOrigin = morphing ? 'center' : '';
      element.style.transform = morphing ? 'scale(' + (1 - faceProgress * 0.18) + ')' : '';
    });
  };
  let currentAnimation = options.animation && DATA.animations[options.animation] ? options.animation : animationNames[0];
  let manualGazeTarget = null;
  let cursorFollowActive = false;
  let cursorDesiredTarget = { x: 0, y: 0 };
  let cursorRenderedTarget = { x: 0, y: 0 };
  let cursorLastFrame = -1;
  let preserveAttachedFace = false;
  const faceForwardForAnimation = () => Boolean(
    DATA.avatar.faceForward && !manualGazeTarget && !preserveAttachedFace && DATA.animations[currentAnimation]?.faceMode !== 'attached'
  );
  const gazeProfileForAnimation = () => {
    const animation = DATA.animations[currentAnimation];
    if (!animation || animation.presentation === 'logo') return null;
    return animation.gazeProfile === 'none' ? null : (animation.gazeProfile || 'attentive');
  };
  const syncFaceClip = () => {
    if (!DATA.avatar.logoMorph && faceForwardForAnimation()) eyesLayer.removeAttribute('clip-path');
    else eyesLayer.setAttribute('clip-path', 'url(#' + clipId + ')');
  };
  syncFaceClip();
  const initialStep = DATA.animations[currentAnimation].steps[0];
  const initialExpression = DATA.expressions[initialStep.expressionId];
  let currentPose = AvatarProceduralEngine.poseFromExpression(initialExpression);
  let currentColors = resolveColors(initialExpression);
  let blinkAmount = 1;
  let transitionState = null;
  let blinkState = null;
  let frameRequest = null;
  let stepTimer = null;
  let blinkTimer = null;
  let autonomousExpressionTimer = null;
  let autonomousActionTimer = null;
  let autonomousStepTimer = null;
  let autonomousActionActive = false;
  let autonomousExpressionId = null;
  let blinkDueAt = null;
  let stepIndex = 0;
  let direction = 1;
  let playing = false;
  let paused = false;
  let pausedRemainingMs = 0;
  let pausedTransition = null;
  let pausedBlink = null;
  let pausedBlinkDelay = 0;
  let stepDueAt = null;
  let eyeAmbientStartedAt = performance.now();
  let bodyAmbientStartedAt = performance.now();
  let gazeStartedAt = performance.now();
  let gazePausedAt = null;
  let activeGazeProfile = null;
  let liveGaze = false;
  let lastRenderedGaze = null;
  let gazeBlendFrom = null;
  let gazeBlendStartedAt = -1;
  let gazeReleaseFrom = null;
  let gazeReleaseStartedAt = -1;
  let gazeReleaseDurationMs = 680;
  const faceMotionExpression = { ...initialExpression, headX: 0, headY: 0, headZ: 0 };
  let eyeAmbientSignature = initialExpression.eyeMotion;
  let bodyAmbientSignature = initialExpression.bodyMotion;
  let ambientStrength = 1;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  let talking = Boolean(options.talking && DATA.avatar.mouth);
  let talkingStartedAt = performance.now();
  let thinking = Boolean(options.thinking && (DATA.avatar.mouth || DATA.avatar.logoMorph));
  let thinkingStartedAt = performance.now();
  if (talking) thinking = false;
  let faceProgress = DATA.avatar.logoMorph ? (options.face === true ? 1 : 0) : 1;
  let faceTransition = null;
  if (talking || thinking) faceProgress = 1;

  const applyMotion = expression => {
    const now = performance.now();
    if (expression.eyeMotion !== eyeAmbientSignature) {
      eyeAmbientSignature = expression.eyeMotion;
      if (!faceForwardForAnimation()) eyeAmbientStartedAt = now;
    }
    if (expression.bodyMotion !== bodyAmbientSignature) {
      bodyAmbientSignature = expression.bodyMotion;
      bodyAmbientStartedAt = now;
    }
  };
  const statusAnchor = geometry => {
    const values = [geometry.headPath, ...geometry.backPaths, ...geometry.frontPaths]
      .flatMap(path => path.match(/-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?/gi) || [])
      .map(Number);
    if (values.length < 2) return { x: 0, y: -118 };
    const xs = [], ys = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      xs.push(values[index]);
      ys.push(values[index + 1]);
    }
    return { x: Math.max(...xs) - 36, y: Math.min(...ys) - 36 };
  };
  const render = (time = performance.now()) => {
    const eyeElapsed = time - eyeAmbientStartedAt;
    const bodyElapsed = time - bodyAmbientStartedAt;
    const ambientExpression = currentPose.expression.bodyMotion !== 'none'
      ? AvatarProceduralEngine.applyAmbientBodyMotion(currentPose.expression, bodyElapsed, ambientStrength)
      : currentPose.expression;
    let gaze = manualGazeTarget
      ? AvatarProceduralEngine.solveGazeRig(manualGazeTarget)
      : !reducedMotion && (playing || paused || liveGaze) && activeGazeProfile
        ? AvatarProceduralEngine.coordinatedGazeAt(activeGazeProfile, time - gazeStartedAt)
        : null;
    if (gaze && DATA.animations[currentAnimation]?.group === 'Animations') {
      gaze = { ...gaze, headBaseWeight: 1 };
    }
    if (gaze && gazeReleaseFrom) gazeReleaseFrom = null;
    if (!gaze && gazeReleaseFrom) {
      if (gazeReleaseStartedAt < 0) gazeReleaseStartedAt = time;
      const releaseProgress = clamp01((time - gazeReleaseStartedAt) / gazeReleaseDurationMs);
      gaze = AvatarProceduralEngine.blendCoordinatedGaze(
        gazeReleaseFrom,
        AvatarProceduralEngine.solveGazeRig({ x: 0, y: 0 }, 1, 1),
        releaseProgress
      );
      if (releaseProgress >= 1) {
        gazeReleaseFrom = null;
        gazeReleaseStartedAt = -1;
      }
    }
    if (gaze && gazeBlendFrom) {
      if (gazeBlendStartedAt < 0) gazeBlendStartedAt = time;
      const gazeBlendProgress = clamp01((time - gazeBlendStartedAt) / 520);
      gaze = AvatarProceduralEngine.blendCoordinatedGaze(gazeBlendFrom, gaze, gazeBlendProgress);
      if (gazeBlendProgress >= 1) {
        gazeBlendFrom = null;
        gazeBlendStartedAt = -1;
      }
    }
    lastRenderedGaze = gaze;
    const expression = gaze
      ? AvatarProceduralEngine.applyCoordinatedGaze(ambientExpression, gaze)
      : ambientExpression;
    const faceForward = faceForwardForAnimation();
    const eyeMotionExpression = faceForward
      ? { ...faceMotionExpression, eyeMotion: currentPose.expression.eyeMotion }
      : currentPose.expression;
    const ambientEyeOffset = AvatarProceduralEngine.ambientEyeOffset(
      eyeMotionExpression,
      eyeElapsed,
      faceForward ? 1 : ambientStrength
    );
    const eyeOffset = {
      x: ambientEyeOffset.x + (gaze?.eyeOffset.x || 0),
      y: ambientEyeOffset.y + (gaze?.eyeOffset.y || 0),
    };
    const renderedPose = AvatarProceduralEngine.poseFromExpression(expression);
    const geometry = AvatarProceduralEngine.renderAvatar(renderedPose, DATA.avatar.surface, blinkAmount, {
      includeWire: false,
      bodyNodes: DATA.avatar.bodyNodes,
      eyeOffset,
      mouth: DATA.avatar.mouth,
      faceForward,
      mouthPose: talking
        ? AvatarProceduralEngine.comicTalkingMouthPoseAt(time - talkingStartedAt, reducedMotion)
        : thinking
          ? AvatarProceduralEngine.comicThinkingMouthPoseAt(time - thinkingStartedAt, reducedMotion)
        : undefined,
    });
    const proceduralOffset = AvatarProceduralEngine.ambientBodyOffset(currentPose.expression, bodyElapsed, ambientStrength);
    const offset = {
      x: (currentPose.expression.stageX || 0) + proceduralOffset.x,
      y: (currentPose.expression.stageY || 0) + proceduralOffset.y,
    };
    motionLayer.setAttribute(
      'transform',
      'translate(' + offset.x + ' ' + offset.y + ')'
    );
    ensurePaths(backLayer, geometry.backPaths, currentColors.body, geometry.backNodeIds);
    ensurePaths(frontLayer, geometry.frontPaths, currentColors.body, geometry.frontNodeIds);
    head.setAttribute('d', geometry.headPath);
    head.setAttribute('fill', currentColors.body);
    head.setAttribute('opacity', String(DATA.avatar.logoMorph?.primaryOpacity ?? 1));
    clipHead.setAttribute('d', geometry.faceClipPath);
    eyesLayer.setAttribute('opacity', String(DATA.avatar.logoMorph ? faceProgress : 1));
    leftEye.setAttribute('d', geometry.leftPath);
    rightEye.setAttribute('d', geometry.rightPath);
    leftEye.setAttribute('fill', currentColors.eyes);
    rightEye.setAttribute('fill', currentColors.eyes);
    leftEye.style.display = geometry.leftVisible ? '' : 'none';
    rightEye.style.display = geometry.rightVisible ? '' : 'none';
    mouth.setAttribute('d', geometry.mouthPath);
    tongue.setAttribute('d', geometry.tonguePath);
    mouth.setAttribute('fill', DATA.avatar.mouth?.color || 'transparent');
    tongue.setAttribute('fill', DATA.avatar.mouth?.tongueColor || 'transparent');
    mouth.style.display = geometry.mouthVisible ? '' : 'none';
    tongue.style.display = geometry.mouthVisible ? '' : 'none';
    thoughtLayer.style.display = thinking ? '' : 'none';
    thoughtLayer.setAttribute('opacity', String(DATA.avatar.logoMorph ? faceProgress : 1));
    if (thinking) {
      const anchor = statusAnchor(geometry);
      thoughtLayer.setAttribute('transform', 'translate(' + (anchor.x + offset.x) + ' ' + (anchor.y + offset.y) + ')');
      const elapsed = time - thinkingStartedAt;
      thoughtBubbles.forEach((bubble, index) => {
        const [baseX, baseY, baseRadius] = thoughtBubbleLayout[index];
        const phase = reducedMotion ? 0.45 : ((elapsed / 1800 - index * 0.1) % 1 + 1) % 1;
        const pop = phase < 0.22 ? phase / 0.22 : phase < 0.72 ? 1 : 1 - (phase - 0.72) / 0.28;
        bubble.setAttribute('cx', baseX);
        bubble.setAttribute('cy', baseY - (reducedMotion ? 0 : phase * 5));
        bubble.setAttribute('r', baseRadius * (0.35 + pop * 0.65));
        bubble.setAttribute('opacity', pop);
        bubble.setAttribute('fill', '#ffffff');
        bubble.setAttribute('stroke', '#111316');
        bubble.setAttribute('stroke-width', '2');
      });
      thoughtDots.forEach((dot, index) => {
        dot.setAttribute('cx', -13 + index * 13);
        dot.setAttribute('cy', -6);
        dot.setAttribute('r', '2.3');
        dot.setAttribute('fill', '#111316');
        dot.setAttribute('opacity', reducedMotion ? '1' : 0.3 + (0.5 + Math.sin(elapsed / 145 + index * 1.4) * 0.5) * 0.7);
      });
    }
  };
  const tick = time => {
    frameRequest = null;
    if (cursorFollowActive) {
      const elapsed = cursorLastFrame < 0 ? 16 : Math.min(time - cursorLastFrame, 50);
      cursorLastFrame = time;
      const blend = 1 - Math.exp(-elapsed / 72);
      cursorRenderedTarget = {
        x: cursorRenderedTarget.x + (cursorDesiredTarget.x - cursorRenderedTarget.x) * blend,
        y: cursorRenderedTarget.y + (cursorDesiredTarget.y - cursorRenderedTarget.y) * blend,
      };
      manualGazeTarget = cursorRenderedTarget;
    }
    if (faceTransition) {
      const linear = clamp01((time - faceTransition.startedAt) / faceTransition.durationMs);
      const eased = linear * linear * (3 - 2 * linear);
      faceProgress = faceTransition.from + (faceTransition.to - faceTransition.from) * eased;
      if (linear >= 1) {
        faceProgress = faceTransition.to;
        faceTransition = null;
        if (faceProgress <= 0.001 && preserveAttachedFace) {
          preserveAttachedFace = false;
          syncFaceClip();
        }
      }
    }
    if (transitionState) {
      const linear = clamp01((time - transitionState.startedAt) / transitionState.durationMs);
      const eased = easeProgress(linear, transitionState.transition);
      ambientStrength = clamp01(eased);
      const expression = { ...transitionState.fromPose.expression };
      AvatarProceduralEngine.expressionFields.forEach(field => {
        expression[field] = transitionState.fromPose.expression[field] +
          (transitionState.toPose.expression[field] - transitionState.fromPose.expression[field]) * eased;
      });
      expression.eyeMotion = transitionState.toPose.expression.eyeMotion;
      expression.bodyMotion = transitionState.toPose.expression.bodyMotion;
      currentPose = AvatarProceduralEngine.poseFromExpression(expression);
      currentColors = {
        body: interpolateColor(transitionState.fromColors.body, transitionState.toColors.body, clamp01(eased)),
        eyes: interpolateColor(transitionState.fromColors.eyes, transitionState.toColors.eyes, clamp01(eased)),
      };
      if (linear >= 1) {
        currentPose = transitionState.toPose;
        currentColors = transitionState.toColors;
        transitionState = null;
        ambientStrength = 1;
      }
    }
    if (blinkState) {
      const progress = clamp01((time - blinkState.startedAt) / blinkState.durationMs);
      if (progress <= 0.42) {
        const closeProgress = progress / 0.42;
        blinkAmount = 1 - closeProgress * closeProgress;
      } else {
        const openProgress = (progress - 0.42) / 0.58;
        blinkAmount = 1 - (1 - openProgress) ** 2;
      }
      if (progress >= 1) {
        blinkAmount = 1;
        blinkState = null;
      }
    }
    const ambientActive = AvatarProceduralEngine.hasAmbientMotion(currentPose.expression);
    const gazeActive = Boolean(activeGazeProfile) && !reducedMotion && (playing || liveGaze);
    // requestAnimationFrame already synchronizes this loop to the display. Do
    // not halve a 60 Hz display to 30 FPS by throttling continuous motion here.
    render(time);
    if (faceTransition || transitionState || blinkState || ambientActive || gazeActive || gazeReleaseFrom || talking || thinking || cursorFollowActive) frameRequest = requestAnimationFrame(tick);
  };
  const requestTick = () => {
    if (frameRequest === null) frameRequest = requestAnimationFrame(tick);
  };
  const followPointer = event => {
    if (!cursorFollowActive || event.pointerType === 'touch') return;
    const bounds = svg.getBoundingClientRect();
    cursorDesiredTarget = {
      x: Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / Math.max(bounds.width * 0.48, 1))),
      y: Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / Math.max(bounds.height * 0.48, 1))),
    };
    requestTick();
  };
  globalThis.addEventListener('pointermove', followPointer, { passive: true });
  const animateTo = (expressionId, durationMs, transition) => {
    const target = DATA.expressions[expressionId];
    if (!target) return;
    applyMotion(target);
    const resolved = resolvedTargetExpression(target, currentPose.expression);
    const targetPose = AvatarProceduralEngine.poseFromExpression(resolved);
    const targetColors = resolveColors(target);
    if (durationMs <= 0) {
      ambientStrength = 1;
      transitionState = null;
      currentPose = targetPose;
      currentColors = targetColors;
      render();
      if (AvatarProceduralEngine.hasAmbientMotion(currentPose.expression)) requestTick();
      return;
    }
    transitionState = {
      fromPose: currentPose,
      toPose: targetPose,
      fromColors: currentColors,
      toColors: targetColors,
      startedAt: performance.now(),
      durationMs,
      transition,
      expressionId,
    };
    ambientStrength = 0;
    requestTick();
  };
  const clearSchedule = () => {
    if (stepTimer !== null) clearTimeout(stepTimer);
    if (blinkTimer !== null) clearTimeout(blinkTimer);
    if (autonomousExpressionTimer !== null) clearTimeout(autonomousExpressionTimer);
    if (autonomousActionTimer !== null) clearTimeout(autonomousActionTimer);
    if (autonomousStepTimer !== null) clearTimeout(autonomousStepTimer);
    stepTimer = null;
    blinkTimer = null;
    autonomousExpressionTimer = null;
    autonomousActionTimer = null;
    autonomousStepTimer = null;
    autonomousActionActive = false;
    blinkDueAt = null;
    stepDueAt = null;
  };
  const scheduleBlink = (animation, delay) => {
    if (!animation.blink.enabled) return;
    blinkDueAt = performance.now() + delay;
    blinkTimer = setTimeout(() => {
      blinkDueAt = null;
      blinkState = { startedAt: performance.now(), durationMs: animation.blink.durationMs };
      requestTick();
      const range = animation.blink.maxIntervalMs - animation.blink.minIntervalMs;
      scheduleBlink(animation, animation.blink.durationMs + animation.blink.minIntervalMs + Math.random() * range);
    }, delay);
  };
  const advance = animation => {
    const last = animation.steps.length - 1;
    const playbackMode = options.loop === true ? 'loop' : options.loop === false ? 'once' : animation.playbackMode;
    if (playbackMode === 'once' && stepIndex >= last) {
      playing = false;
      liveGaze = animation.group === 'Animations';
      options.onAnimationEnd?.(currentAnimation);
      if (liveGaze) requestTick();
      return;
    }
    if (playbackMode === 'pingPong' && last > 0) {
      if (stepIndex >= last) direction = -1;
      else if (stepIndex <= 0) direction = 1;
      stepIndex += direction;
    } else stepIndex = (stepIndex + 1) % (last + 1);
    runStep(animation);
  };
  const runStep = animation => {
    if (!playing || !animation.steps.length) return;
    const step = animation.steps[stepIndex];
    animateTo(step.expressionId, step.transitionMs, step.transition);
    const duration = step.transitionMs + step.holdMs;
    stepDueAt = performance.now() + duration;
    stepTimer = setTimeout(() => advance(animation), duration);
  };
  const startAutonomous = animation => {
    const expressionSteps = animation.steps.filter(step => DATA.expressions[step.expressionId]);
    if (!expressionSteps.length) return;
    const stillActive = () => playing && DATA.animations[currentAnimation]?.driver === 'autonomous';
    const randomBetween = (minimum, maximum) => minimum + (maximum - minimum) * Math.random();
    const pickDifferent = (values, previous) => {
      const choices = values.length > 1 ? values.filter(value => value !== previous) : values;
      return choices[Math.min(Math.floor(Math.random() * choices.length), choices.length - 1)];
    };
    const scheduleExpression = (delay = randomBetween(1700, 3300)) => {
      autonomousExpressionTimer = setTimeout(() => {
        if (!stillActive()) return;
        if (autonomousActionActive) {
          scheduleExpression(650);
          return;
        }
        const step = pickDifferent(expressionSteps, expressionSteps.find(item => item.expressionId === autonomousExpressionId));
        autonomousExpressionId = step.expressionId;
        animateTo(step.expressionId, Math.round(randomBetween(620, 980)), 'smooth');
        scheduleExpression();
      }, delay);
    };
    const scheduleAction = (delay = randomBetween(5200, 9200)) => {
      autonomousActionTimer = setTimeout(() => {
        if (!stillActive()) return;
        const actions = ['character-jumping', 'character-excited-bounce', 'character-surprised-jolt']
          .map(id => DATA.animations[id])
          .filter(Boolean);
        const action = actions[Math.floor(Math.random() * actions.length)];
        if (!action) {
          scheduleAction();
          return;
        }
        autonomousActionActive = true;
        const actionSteps = action.steps.slice(1, -1);
        let position = 0;
        const playActionStep = () => {
          if (!stillActive()) return;
          const step = actionSteps[position++];
          if (!step) {
            const resting = expressionSteps.find(item => item.expressionId === autonomousExpressionId) || expressionSteps[0];
            animateTo(resting.expressionId, 720, 'smooth');
            autonomousStepTimer = setTimeout(() => {
              if (!stillActive()) return;
              autonomousActionActive = false;
              scheduleAction();
            }, 720);
            return;
          }
          animateTo(step.expressionId, step.transitionMs, step.transition);
          autonomousStepTimer = setTimeout(playActionStep, step.transitionMs + step.holdMs);
        };
        playActionStep();
      }, delay);
    };
    const initial = expressionSteps[Math.floor(Math.random() * expressionSteps.length)];
    autonomousExpressionId = initial.expressionId;
    animateTo(initial.expressionId, 760, 'smooth');
    scheduleExpression();
    scheduleAction();
  };
  const api = {
    element: svg,
    get animation() { return currentAnimation; },
    get playing() { return playing; },
    get faceRevealed() { return faceProgress >= 0.5; },
    play(animationName) {
      animationName = animationName || currentAnimation;
      if (!DATA.animations[animationName]) throw new Error('Unknown animation: ' + animationName);
      clearSchedule();
      if (animationName === currentAnimation && paused) {
        const resumedAt = performance.now();
        const resumedAnimation = DATA.animations[currentAnimation];
        if (gazePausedAt !== null) gazeStartedAt += resumedAt - gazePausedAt;
        gazePausedAt = null;
        paused = false;
        playing = true;
        if (resumedAnimation.driver) {
          cursorFollowActive = true;
          manualGazeTarget = cursorRenderedTarget;
          if (resumedAnimation.driver === 'autonomous') startAutonomous(resumedAnimation);
          scheduleBlink(
            resumedAnimation,
            pausedBlinkDelay || resumedAnimation.blink.minIntervalMs
          );
          pausedTransition = null;
          pausedBlink = null;
          pausedBlinkDelay = 0;
          syncFaceClip();
          requestTick();
          return api;
        }
        if (pausedTransition) animateTo(pausedTransition.expressionId, pausedTransition.durationMs, pausedTransition.transition);
        if (pausedBlink) {
          blinkState = {
            startedAt: performance.now() - pausedBlink.progress * pausedBlink.durationMs,
            durationMs: pausedBlink.durationMs,
          };
          requestTick();
        }
        stepDueAt = performance.now() + pausedRemainingMs;
        stepTimer = setTimeout(() => advance(DATA.animations[currentAnimation]), pausedRemainingMs);
        scheduleBlink(
          DATA.animations[currentAnimation],
          pausedBlinkDelay || DATA.animations[currentAnimation].blink.minIntervalMs
        );
        pausedTransition = null;
        pausedBlink = null;
        pausedBlinkDelay = 0;
        return api;
      }
      const cursorWasActive = cursorFollowActive;
      const previousGazeProfile = activeGazeProfile;
      const requestedGazeProfile = DATA.animations[animationName].presentation === 'logo' || DATA.animations[animationName].gazeProfile === 'none'
        ? null
        : (DATA.animations[animationName].gazeProfile || 'attentive');
      const nextGazeProfile = requestedGazeProfile;
      if (previousGazeProfile !== nextGazeProfile) {
        gazeBlendFrom = lastRenderedGaze;
        gazeBlendStartedAt = -1;
        gazeStartedAt = performance.now();
      }
      activeGazeProfile = nextGazeProfile;
      liveGaze = false;
      currentAnimation = animationName;
      gazePausedAt = null;
      const animation = DATA.animations[currentAnimation];
      cursorFollowActive = Boolean(animation.driver);
      cursorLastFrame = -1;
      if (cursorFollowActive) {
        gazeReleaseFrom = null;
        gazeReleaseStartedAt = -1;
        preserveAttachedFace = false;
        if (!cursorWasActive) {
          cursorDesiredTarget = { x: 0, y: 0 };
          cursorRenderedTarget = { x: 0, y: 0 };
        }
        manualGazeTarget = cursorRenderedTarget;
      } else {
        if (cursorWasActive && lastRenderedGaze) {
          gazeReleaseFrom = lastRenderedGaze;
          gazeReleaseStartedAt = -1;
          gazeReleaseDurationMs = Math.max(animation.steps[0]?.transitionMs || 500, 680);
        } else {
          gazeReleaseFrom = null;
          gazeReleaseStartedAt = -1;
        }
        preserveAttachedFace = Boolean(
          cursorWasActive && animation.presentation === 'logo' && faceProgress > 0.001
        );
        manualGazeTarget = null;
      }
      syncFaceClip();
      if (animation.presentation === 'logo') api.setFace(false);
      else if (animation.presentation === 'face') api.setFace(true);
      api.setThinking(animation.effect === 'thinking');
      stepIndex = 0;
      direction = 1;
      paused = false;
      playing = true;
      if (animation.driver === 'cursor') {
        const first = animation.steps[0];
        if (first) animateTo(first.expressionId, first.transitionMs, first.transition);
        scheduleBlink(animation, animation.blink.initialDelayMs);
        requestTick();
        return api;
      }
      if (animation.driver === 'autonomous') {
        startAutonomous(animation);
        scheduleBlink(animation, animation.blink.initialDelayMs);
        requestTick();
        return api;
      }
      runStep(animation);
      scheduleBlink(animation, animation.blink.initialDelayMs);
      return api;
    },
    pause() {
      const now = performance.now();
      gazePausedAt = now;
      if (playing && stepDueAt !== null) pausedRemainingMs = Math.max(stepDueAt - now, 0);
      pausedBlinkDelay = blinkDueAt === null ? 0 : Math.max(blinkDueAt - now, 0);
      if (transitionState) {
        const elapsed = now - transitionState.startedAt;
        pausedTransition = {
          expressionId: transitionState.expressionId,
          durationMs: Math.max(transitionState.durationMs - elapsed, 0),
          transition: transitionState.transition,
        };
      }
      if (blinkState) {
        pausedBlink = {
          progress: clamp01((now - blinkState.startedAt) / blinkState.durationMs),
          durationMs: blinkState.durationMs,
        };
      }
      clearSchedule();
      transitionState = null;
      blinkState = null;
      cursorFollowActive = false;
      manualGazeTarget = null;
      paused = true;
      playing = false;
      liveGaze = false;
      render();
      return api;
    },
    stop() {
      clearSchedule();
      transitionState = null;
      blinkState = null;
      blinkAmount = 1;
      pausedBlink = null;
      pausedBlinkDelay = 0;
      paused = false;
      playing = false;
      liveGaze = false;
      cursorFollowActive = false;
      manualGazeTarget = null;
      activeGazeProfile = null;
      lastRenderedGaze = null;
      gazeBlendFrom = null;
      gazeBlendStartedAt = -1;
      gazeReleaseFrom = null;
      gazeReleaseStartedAt = -1;
      preserveAttachedFace = false;
      gazeStartedAt = performance.now();
      gazePausedAt = null;
      stepIndex = 0;
      direction = 1;
      const first = DATA.animations[currentAnimation].steps[0];
      if (first) animateTo(first.expressionId, 0, first.transition);
      return api;
    },
    setTalking(next) {
      const resolved = Boolean(next && (DATA.avatar.mouth || DATA.avatar.logoMorph));
      if (resolved === talking) return api;
      talking = resolved;
      if (talking) thinking = false;
      if (talking) api.setFace(true);
      talkingStartedAt = performance.now();
      render();
      if (talking && !reducedMotion) requestTick();
      return api;
    },
    setGaze(x, y) {
      manualGazeTarget = x === null || x === undefined
        ? null
        : { x: Math.max(-1, Math.min(1, Number(x) || 0)), y: Math.max(-1, Math.min(1, Number(y) || 0)) };
      syncFaceClip();
      render();
      return api;
    },
    startTalking() { return api.setTalking(true); },
    stopTalking() { return api.setTalking(false); },
    setThinking(next) {
      const resolved = Boolean(next && (DATA.avatar.mouth || DATA.avatar.logoMorph));
      if (resolved === thinking) return api;
      thinking = resolved;
      if (thinking) talking = false;
      if (thinking) api.setFace(true);
      thinkingStartedAt = performance.now();
      render();
      if (thinking && !reducedMotion) requestTick();
      return api;
    },
    startThinking() { return api.setThinking(true); },
    stopThinking() { return api.setThinking(false); },
    setFace(next, durationMs = 620) {
      if (!DATA.avatar.logoMorph) return api;
      const target = next ? 1 : 0;
      if (!target) {
        talking = false;
        thinking = false;
      }
      if (reducedMotion || durationMs <= 0) {
        faceTransition = null;
        faceProgress = target;
        if (!target) preserveAttachedFace = false;
        syncFaceClip();
        render();
        return api;
      }
      faceTransition = {
        from: faceProgress,
        to: target,
        startedAt: performance.now(),
        durationMs,
      };
      requestTick();
      return api;
    },
    showFace(durationMs) { return api.setFace(true, durationMs); },
    showLogo(durationMs) { return api.setFace(false, durationMs); },
    destroy() {
      clearSchedule();
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      globalThis.removeEventListener('pointermove', followPointer);
      svg.remove();
    },
  };
  applyMotion(initialExpression);
  render();
  if (AvatarProceduralEngine.hasAmbientMotion(initialExpression)) requestTick();
  if (talking && !reducedMotion) requestTick();
  if (thinking && !reducedMotion) requestTick();
  if (options.autoplay !== false) api.play(currentAnimation);
  return api;
}
`
