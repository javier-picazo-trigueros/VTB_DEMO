import { Joyride, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export function OnboardingTour({ role = 'student' }) {
  const { t } = useTranslation();
  const { user, markTourCompleted } = useAuth();
  const [run, setRun] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  // Solo si el servidor dice explícitamente que no lo ha completado: un usuario
  // sin el campo (sesión por hidratar) no ve el tutorial.
  const shouldShow = user?.tourCompleted === false;

  useEffect(() => {
    if (!shouldShow || startedRef.current) return undefined;
    const timer = setTimeout(() => {
      startedRef.current = true;
      setRun(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  const markDone = () => {
    setRun(false);
    if (doneRef.current) return;
    doneRef.current = true;
    // Si falla, el tutorial vuelve a salir la próxima vez: es lo menos malo.
    markTourCompleted(true).catch(() => {});
  };

  // react-joyride 3.x: el manejador es `onEvent` (en la 2.x era `callback`, que la
  // 3.x ignora en silencio) y recibe un objeto con `type`, `status` y `action`.
  const handleEvent = ({ type, status, action }) => {
    const finished = type === EVENTS.TOUR_END || status === STATUS.FINISHED || status === STATUS.SKIPPED;
    // Also catch close-button click, escape key, overlay click
    const dismissed = action === ACTIONS.CLOSE || action === ACTIONS.SKIP || action === ACTIONS.RESET;
    if (finished || dismissed) markDone();
  };

  const voterSteps = [
    { target: 'body', content: t('onboarding.voterWelcome'), placement: 'center' },
    { target: '[data-tour="elections-list"]', content: t('onboarding.electionsList') },
    { target: '[data-tour="filter-bar"]', content: t('onboarding.filterBar') },
    { target: '[data-tour="transparency-link"]', content: t('onboarding.transparencyLink') },
  ];

  const adminSteps = [
    { target: 'body', content: t('onboarding.adminWelcome'), placement: 'center' },
    { target: '[data-tour="create-election"]', content: t('onboarding.createElection') },
    { target: '[data-tour="requests-tab"]', content: t('onboarding.requestsTab') },
    { target: '[data-tour="stats-tab"]', content: t('onboarding.statsTab') },
  ];

  const steps = ['admin', 'superadmin'].includes(role) ? adminSteps : voterSteps;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      // En la 3.x estas opciones viven en `options` (antes eran props sueltas y
      // `styles.options`: showProgress, showSkipButton, disableBeacon...).
      options={{
        primaryColor: '#2572A0',
        zIndex: 10000,
        backgroundColor: '#1e293b',
        textColor: '#f1f5f9',
        arrowColor: '#1e293b',
        showProgress: true,
        skipBeacon: true,
        buttons: ['back', 'skip', 'primary'],
      }}
      styles={{
        tooltip: { borderRadius: '12px' },
        buttonPrimary: { color: '#ffffff' },
        buttonBack: { color: '#cbd5e1' },
      }}
      locale={{
        back: t('onboarding.back'),
        close: t('onboarding.close'),
        last: t('onboarding.finish'),
        next: t('onboarding.next'),
        nextWithProgress: t('onboarding.nextWithProgress'),
        skip: t('onboarding.skip'),
      }}
    />
  );
}
