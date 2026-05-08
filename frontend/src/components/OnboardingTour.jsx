import { Joyride, STATUS } from 'react-joyride';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

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

  const handleCallback = ({ status, action }) => {
    const finished = status === STATUS.FINISHED || status === STATUS.SKIPPED;
    // Also catch close-button click, escape key, overlay click
    const dismissed = action === 'close' || action === 'skip' || action === 'reset';
    if (finished || dismissed) markDone();
  };

  const voterSteps = [
    { target: 'body', content: t('onboarding.voterWelcome'), placement: 'center', disableBeacon: true },
    { target: '[data-tour="elections-list"]', content: t('onboarding.electionsList'), disableBeacon: true },
    { target: '[data-tour="filter-bar"]', content: t('onboarding.filterBar'), disableBeacon: true },
    { target: '[data-tour="transparency-link"]', content: t('onboarding.transparencyLink'), disableBeacon: true },
  ];

  const adminSteps = [
    { target: 'body', content: t('onboarding.adminWelcome'), placement: 'center', disableBeacon: true },
    { target: '[data-tour="create-election"]', content: t('onboarding.createElection'), disableBeacon: true },
    { target: '[data-tour="requests-tab"]', content: t('onboarding.requestsTab'), disableBeacon: true },
    { target: '[data-tour="stats-tab"]', content: t('onboarding.statsTab'), disableBeacon: true },
  ];

  const steps = ['admin', 'superadmin'].includes(role) ? adminSteps : voterSteps;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableScrolling={false}
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: '#2563eb',
          zIndex: 10000,
          backgroundColor: '#1e293b',
          textColor: '#f1f5f9',
          arrowColor: '#1e293b',
        },
        tooltip: { borderRadius: '12px' },
        buttonNext: { backgroundColor: '#2563eb', borderRadius: '8px' },
      }}
      locale={{
        back: t('onboarding.back'),
        close: t('onboarding.close'),
        last: t('onboarding.finish'),
        next: t('onboarding.next'),
        skip: t('onboarding.skip'),
      }}
    />
  );
}
