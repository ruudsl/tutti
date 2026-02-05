import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

interface TourStep {
  titleKey: string;
  descriptionKey: string;
  icon: string;
  navigateTo?: string;
}

const TOUR_STEPS: Record<string, TourStep[]> = {
  admin: [
    { titleKey: 'onboarding.admin.welcome.title', descriptionKey: 'onboarding.admin.welcome.description', icon: '👋' },
    { titleKey: 'onboarding.admin.orchestras.title', descriptionKey: 'onboarding.admin.orchestras.description', icon: '🎺', navigateTo: '/orchestras' },
    { titleKey: 'onboarding.admin.members.title', descriptionKey: 'onboarding.admin.members.description', icon: '👥', navigateTo: '/users' },
    { titleKey: 'onboarding.admin.settings.title', descriptionKey: 'onboarding.admin.settings.description', icon: '⚙️', navigateTo: '/settings' },
    { titleKey: 'onboarding.admin.rehearsals.title', descriptionKey: 'onboarding.admin.rehearsals.description', icon: '📅', navigateTo: '/rehearsals' },
    { titleKey: 'onboarding.admin.done.title', descriptionKey: 'onboarding.admin.done.description', icon: '🎉' },
  ],
  music_committee: [
    { titleKey: 'onboarding.mc.welcome.title', descriptionKey: 'onboarding.mc.welcome.description', icon: '👋' },
    { titleKey: 'onboarding.mc.upload.title', descriptionKey: 'onboarding.mc.upload.description', icon: '📤', navigateTo: '/upload' },
    { titleKey: 'onboarding.mc.lists.title', descriptionKey: 'onboarding.mc.lists.description', icon: '📋', navigateTo: '/lists' },
    { titleKey: 'onboarding.mc.pieces.title', descriptionKey: 'onboarding.mc.pieces.description', icon: '🎵', navigateTo: '/music-pieces' },
    { titleKey: 'onboarding.mc.titles.title', descriptionKey: 'onboarding.mc.titles.description', icon: '🎼', navigateTo: '/titles' },
    { titleKey: 'onboarding.mc.instruments.title', descriptionKey: 'onboarding.mc.instruments.description', icon: '🎷', navigateTo: '/instruments' },
    { titleKey: 'onboarding.mc.done.title', descriptionKey: 'onboarding.mc.done.description', icon: '🎉' },
  ],
  conductor: [
    { titleKey: 'onboarding.conductor.welcome.title', descriptionKey: 'onboarding.conductor.welcome.description', icon: '👋' },
    { titleKey: 'onboarding.conductor.rehearsals.title', descriptionKey: 'onboarding.conductor.rehearsals.description', icon: '📅', navigateTo: '/rehearsals' },
    { titleKey: 'onboarding.conductor.pieces.title', descriptionKey: 'onboarding.conductor.pieces.description', icon: '🎵' },
    { titleKey: 'onboarding.conductor.mymusic.title', descriptionKey: 'onboarding.conductor.mymusic.description', icon: '🎶', navigateTo: '/my-music' },
    { titleKey: 'onboarding.conductor.done.title', descriptionKey: 'onboarding.conductor.done.description', icon: '🎉' },
  ],
  member: [
    { titleKey: 'onboarding.member.welcome.title', descriptionKey: 'onboarding.member.welcome.description', icon: '👋' },
    { titleKey: 'onboarding.member.mymusic.title', descriptionKey: 'onboarding.member.mymusic.description', icon: '🎵', navigateTo: '/my-music' },
    { titleKey: 'onboarding.member.rehearsals.title', descriptionKey: 'onboarding.member.rehearsals.description', icon: '📅', navigateTo: '/rehearsals' },
    { titleKey: 'onboarding.member.issues.title', descriptionKey: 'onboarding.member.issues.description', icon: '📝', navigateTo: '/issues' },
    { titleKey: 'onboarding.member.profile.title', descriptionKey: 'onboarding.member.profile.description', icon: '👤', navigateTo: '/profile' },
    { titleKey: 'onboarding.member.done.title', descriptionKey: 'onboarding.member.done.description', icon: '🎉' },
  ],
};

function getStorageKey(userId: string): string {
  return `onboarding_completed_${userId}`;
}

export function hasCompletedOnboarding(userId: string): boolean {
  return localStorage.getItem(getStorageKey(userId)) === 'true';
}

export function resetOnboarding(userId: string): void {
  localStorage.removeItem(getStorageKey(userId));
}

function markOnboardingComplete(userId: string): void {
  localStorage.setItem(getStorageKey(userId), 'true');
}

// Welcome dialog shown before the tour starts
function WelcomeDialog({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title">
      <div className="onboarding-card onboarding-welcome">
        <div className="onboarding-icon">👋</div>
        <h2 id="onboarding-welcome-title">{t('onboarding.welcomeTitle')}</h2>
        <p>{t('onboarding.welcomeDescription')}</p>
        <div className="onboarding-actions">
          <button className="btn btn-primary" onClick={onStart}>
            {t('onboarding.startTour')}
          </button>
          <button className="btn btn-outline" onClick={onSkip}>
            {t('onboarding.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tour step display
function TourStepView({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onNavigate,
}: {
  step: TourStep;
  currentIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const isLast = currentIndex === totalSteps - 1;
  const isFirst = currentIndex === 0;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-step-title">
      <div className="onboarding-card">
        <button className="onboarding-close" onClick={onSkip} aria-label={t('common.close')} type="button">
          &times;
        </button>
        <div className="onboarding-progress">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'completed' : ''}`}
            />
          ))}
        </div>
        <div className="onboarding-icon">{step.icon}</div>
        <h2 id="onboarding-step-title">{t(step.titleKey)}</h2>
        <p>{t(step.descriptionKey)}</p>
        {step.navigateTo && onNavigate && (
          <button className="btn btn-outline btn-sm mb-2" onClick={onNavigate}>
            {t('onboarding.goToPage')} →
          </button>
        )}
        <div className="onboarding-actions">
          {!isFirst && (
            <button className="btn btn-outline" onClick={onPrev}>
              {t('onboarding.previous')}
            </button>
          )}
          <button className="btn btn-primary" onClick={onNext}>
            {isLast ? t('onboarding.finish') : t('onboarding.next')}
          </button>
        </div>
        <div className="onboarding-step-count">
          {currentIndex + 1} / {totalSteps}
        </div>
      </div>
    </div>
  );
}

interface OnboardingTourProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export function OnboardingTour({ forceShow, onClose }: OnboardingTourProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'welcome' | 'touring'>('idle');
  const [stepIndex, setStepIndex] = useState(0);

  const role = user?.role || 'member';
  const steps = TOUR_STEPS[role] || TOUR_STEPS.member;

  useEffect(() => {
    if (!user) return;

    if (forceShow) {
      setPhase('welcome');
      setStepIndex(0);
      return;
    }

    // Check if this is the user's first time
    if (!hasCompletedOnboarding(user.id)) {
      setPhase('welcome');
    }
  }, [user, forceShow]);

  const handleComplete = useCallback(() => {
    if (user) markOnboardingComplete(user.id);
    setPhase('idle');
    setStepIndex(0);
    onClose?.();
  }, [user, onClose]);

  const handleStart = () => {
    setPhase('touring');
    setStepIndex(0);
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      handleComplete();
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const handleNavigate = () => {
    const step = steps[stepIndex];
    if (step.navigateTo) {
      navigate(step.navigateTo);
    }
  };

  if (phase === 'idle' || !user) return null;

  if (phase === 'welcome') {
    return <WelcomeDialog onStart={handleStart} onSkip={handleSkip} />;
  }

  const currentStep = steps[stepIndex];

  return (
    <TourStepView
      step={currentStep}
      currentIndex={stepIndex}
      totalSteps={steps.length}
      onNext={handleNext}
      onPrev={handlePrev}
      onSkip={handleSkip}
      onNavigate={currentStep.navigateTo ? handleNavigate : undefined}
    />
  );
}
