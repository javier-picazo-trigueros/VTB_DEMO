import { Joyride, STATUS } from 'react-joyride';
import { useState, useEffect } from 'react';

function getTourKey() {
  try {
    const stored = localStorage.getItem('vtb-user');
    const user = stored ? JSON.parse(stored) : null;
    const userId = user?.id || user?.email || 'anon';
    return `vtb-tour-done-${userId}`;
  } catch {
    return 'vtb-tour-done-anon';
  }
}

export function OnboardingTour({ role = 'student' }) {
  const [run, setRun] = useState(false);
  const [tourKey, setTourKey] = useState('');

  useEffect(() => {
    const key = getTourKey();
    setTourKey(key);
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setRun(true), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const voterSteps = [
    { target: 'body', content: '👋 Welcome to VTB! Let us show you around.', placement: 'center', disableBeacon: true },
    { target: '[data-tour="elections-list"]', content: '🗳️ These are your active elections. Click any card to vote anonymously on the blockchain.', disableBeacon: true },
    { target: '[data-tour="filter-bar"]', content: '🔍 Filter by status or search by name.', disableBeacon: true },
    { target: '[data-tour="transparency-link"]', content: '🔗 View the public blockchain audit — no login required. All votes verifiable on Ethereum.', disableBeacon: true },
  ];

  const adminSteps = [
    { target: 'body', content: '👋 Welcome to the VTB Admin Panel!', placement: 'center', disableBeacon: true },
    { target: '[data-tour="create-election"]', content: '➕ Create elections targeting specific schools or your whole domain.', disableBeacon: true },
    { target: '[data-tour="requests-tab"]', content: '📥 Pending registration requests appear here.', disableBeacon: true },
    { target: '[data-tour="stats-tab"]', content: '📊 Click any election for detailed participation stats and voter list.', disableBeacon: true },
  ];

  const steps = ['admin', 'superadmin'].includes(role) ? adminSteps : voterSteps;

  const handleCallback = ({ status }) => {
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      if (tourKey) localStorage.setItem(tourKey, 'true');
      setRun(false);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
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
      locale={{ back: 'Back', close: 'Close', last: 'Finish', next: 'Next →', skip: 'Skip tour' }}
    />
  );
}
