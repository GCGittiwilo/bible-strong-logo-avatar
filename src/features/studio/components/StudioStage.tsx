import { AudioLines, BrainCircuit, Camera, Frame, Info, ScanFace } from 'lucide-react'
import { motion } from 'motion/react'
import { type CSSProperties, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { AvatarCanvas } from '@/features/rendering/components/AvatarCanvas'
import { StudioIdentity } from '@/features/studio/components/StudioIdentity'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioStage({ controller }: { controller: StudioController }) {
  const [photoHelpOpen, setPhotoHelpOpen] = useState(false)
  const {
    activeAvatarEyes,
    activeAvatar,
    activeSequenceLabel,
    activeStatusEffect,
    bodyEditing,
    canvasExpression,
    commitBodyNode,
    editing,
    expression,
    faceReveal,
    faceRevealed,
    freezeLivePreviewForManipulation,
    highlight,
    linked,
    mode,
    persistEditedEyeExpression,
    photoFlash,
    playbackStatus,
    previewCanvasExpression,
    previewExpressionDraft,
    previewSelectedBodyNode,
    renderedColors,
    renderedRotationGizmo,
    renderedScene,
    selectBodyNode,
    selectedBodyNode,
    selectedBodyNodeId,
    selectedEyeSide,
    setEditing,
    setSelectedEyeSide,
    showWire,
    surface,
    t,
    takePicture,
    talking,
    thinking,
    toggleTalking,
    toggleThinking,
    toggleLogoFace,
    transitionToExpression,
    updateHighlight,
    updateImmediate,
  } = controller
  return (
    <motion.section
      className="stage-column"
      data-logo-avatar={activeAvatar.logoMorph ? '' : undefined}
      style={
        {
          '--avatar-body-color': renderedColors.body,
          '--avatar-eye-color': renderedColors.eyes,
        } as CSSProperties
      }
    >
      <StudioIdentity
        className="stage-identity"
        language={controller.language}
        setLanguage={controller.setLanguage}
        t={t}
      />
      <AvatarCanvas
        expression={canvasExpression}
        avatarEyes={activeAvatarEyes}
        mouth={activeAvatar.mouth}
        logoMorph={activeAvatar.logoMorph}
        faceForward={activeAvatar.faceForward}
        faceReveal={faceReveal}
        statusEffect={activeStatusEffect}
        surface={surface}
        scene={renderedScene}
        rotationGizmo={renderedRotationGizmo}
        showWire={showWire}
        bodyEditing={bodyEditing}
        selectedBodyNodeId={selectedBodyNodeId}
        selectedBodyNode={selectedBodyNode}
        selectedSide={selectedEyeSide}
        linked={linked}
        highlight={highlight}
        onHighlightChange={updateHighlight}
        onBodyNodeSelect={selectBodyNode}
        onBodyNodePreview={previewSelectedBodyNode}
        onBodyNodeChange={commitBodyNode}
        onEyeSelect={setSelectedEyeSide}
        onPreview={previewCanvasExpression}
        onChange={editing ? previewExpressionDraft : updateImmediate}
        onReset={next => {
          if (editing) {
            setEditing(current => (current ? { ...current, draft: next } : current))
          }
          transitionToExpression(next)
        }}
        onEyeChange={
          editing ? previewExpressionDraft : bodyEditing ? persistEditedEyeExpression : undefined
        }
        playback={
          activeSequenceLabel && playbackStatus !== 'stopped'
            ? { name: activeSequenceLabel, status: playbackStatus }
            : null
        }
        onManipulationStart={freezeLivePreviewForManipulation}
      />
      {photoFlash > 0 && (
        <motion.div
          className="photo-flash"
          key={photoFlash}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.92, 0] }}
          transition={{ duration: 0.38, times: [0, 0.16, 1], ease: 'easeOut' }}
        />
      )}
      <TooltipProvider>
        <div className="photo-capture-bar">
          {activeAvatar.logoMorph && (
            <Button
              className={`talk-preview-button${faceRevealed ? ' is-face-revealed' : ''}`}
              variant="secondary"
              type="button"
              aria-label={t(faceRevealed ? 'Afficher le logo' : 'Afficher le visage')}
              aria-pressed={faceRevealed}
              onClick={toggleLogoFace}
            >
              {faceRevealed ? <Frame /> : <ScanFace />}
              <span className="logo-morph-preview-label">
                {t(faceRevealed ? 'Afficher le logo' : 'Afficher le visage')}
              </span>
            </Button>
          )}
          {(activeAvatar.mouth || activeAvatar.logoMorph) && (
            <>
              <Button
                className={`talk-preview-button${thinking ? ' is-thinking' : ''}`}
                variant="secondary"
                type="button"
                aria-label={t(thinking ? 'Arrêter de réfléchir' : 'Réfléchir')}
                aria-pressed={thinking}
                onClick={toggleThinking}
              >
                <BrainCircuit />
                <span className="thinking-preview-label">
                  {t(thinking ? 'Arrêter de réfléchir' : 'Réfléchir')}
                </span>
              </Button>
              {activeAvatar.mouth && (
                <Button
                  className={`talk-preview-button${talking ? ' is-talking' : ''}`}
                  variant="secondary"
                  type="button"
                  aria-label={t(talking ? 'Arrêter de parler' : 'Faire parler')}
                  aria-pressed={talking}
                  onClick={toggleTalking}
                >
                  <AudioLines />
                  <span className="talk-preview-label">
                    {t(talking ? 'Arrêter de parler' : 'Faire parler')}
                  </span>
                </Button>
              )}
            </>
          )}
          <Button
            className="photo-capture-button"
            type="button"
            aria-label={t('Prendre une photo')}
            onClick={takePicture}
          >
            <Camera />
            <span className="photo-capture-label">{t('Prendre une photo')}</span>
          </Button>
          <Tooltip
            open={photoHelpOpen}
            onOpenChange={open => {
              if (!open) setPhotoHelpOpen(false)
            }}
          >
            <TooltipTrigger
              closeOnClick={false}
              render={
                <Button
                  className="photo-help-button"
                  variant="secondary"
                  size="icon-sm"
                  type="button"
                  aria-label={t('Informations sur le mode photo')}
                  aria-expanded={photoHelpOpen}
                  onClick={() => setPhotoHelpOpen(open => !open)}
                />
              }
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent side="top" className="photo-help-tooltip">
              {t('Tu peux modifier le format, le fond et la définition du mode photo dans Export.')}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <p className="stage-credit">
        Made with ❤️ by{' '}
        <a href="https://github.com/GCGittiwilo" target="_blank" rel="noreferrer">
          @GCGittiwilo
        </a>
        .
      </p>
    </motion.section>
  )
}
