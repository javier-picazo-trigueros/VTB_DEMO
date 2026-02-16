import React, { useState } from 'react';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import VotingBooth from './pages/VotingBooth';

function App() {
  const [user, setUser] = useState(null);
  const [selectedElection, setSelectedElection] = useState(null);

  // Navegación simple basada en estado (sin Router para simplificar la demo)
  if (!user) {
    return <Landing onLogin={setUser} />;
  }

  if (selectedElection) {
    return <VotingBooth 
      user={user} 
      election={selectedElection} 
      onBack={() => setSelectedElection(null)} 
    />;
  }

  return <Dashboard user={user} onSelectElection={setSelectedElection} />;
}

export default App;