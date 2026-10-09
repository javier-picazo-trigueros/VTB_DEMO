import { Joyride, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { optionalStorageDeclined } from './CookieBanner';

function getTourIdentity(userId) {
  return userId || (() => {
    try {
      const u = JSON.parse(localStorage.getItem('vtb-user') || '{}');
      return u.id || u.email || localStorage.getItem('vtb-user-id') || localStorage.getItem('vtb-email') || null;
    } catch {
      return localStorage.getItem('vtb-user-id') || localStorage.getItem('vtb-email') || null;
    }
  })();
}

function makeTourKey(userId) {
  const id = getTourIdentity(userId);
  return id ? `vtb-tour-done-${id}` : null;
}

export function OnboardingTour({ role = 'student', userId }) {
  const { t } = useTranslation();
  const [run, setRun] = useState(false);
  const keyRef = useRef('');

  useEffect(() => {
    // El aviso de cookies ofrece "rechazar las opcionales"; la marca del tour
    // es una de ellas. Sin esto, el botón no hacía nada.
    if (optionalStorageDeclined()) return undefined;

    const key = makeTourKey(userId);
    if (!key) return undefined;

    keyRef.current = key;
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => {
        // Mark as seen before opening so navigating away mid-tour does not show it again.
        localStorage.setItem(key, 'true');
        setRun(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [userId]);

  const markDone = () => {
    const key = keyRef.current || makeTourKey(userId);
    if (key) localStorage.setItem(key, 'true');
    setRun(false);
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
        primaryColor: '#2563eb',
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
