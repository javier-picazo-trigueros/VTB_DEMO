const fs = require('fs');
const path = require('path');

const applyChanges = (filepath, replacements) => {
  if (!fs.existsSync(filepath)) return;
  let content = fs.readFileSync(filepath, 'utf8');
  replacements.forEach(({ match, replace }) => {
    content = content.replace(match, replace);
  });
  fs.writeFileSync(filepath, content);
  console.log(`Translated strings in ${path.basename(filepath)}`);
};

// ==========================================
// ElectionResults.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/ElectionResults.jsx'), [
  { match: /Resultados:/g, replace: "Results:" },
  { match: /Resultados de/g, replace: "Results for" },
  { match: /Información General/g, replace: "General Information" },
  { match: /Estado/g, replace: "Status" },
  { match: /Finalizada/g, replace: "Completed" },
  { match: /En curso/g, replace: "In Progress" },
  { match: /Cerrada/g, replace: "Closed" },
  { match: /Votos emitidos/g, replace: "Votes cast" },
  { match: /Censo total/g, replace: "Total census" },
  { match: /Participación/g, replace: "Participation" },
  { match: /Auditoría de Votos/g, replace: "Vote Audit" },
  { match: /Exportar CSV/g, replace: "Export CSV" },
  { match: /Fecha y Hora \(Local\)/g, replace: "Date and Time (Local)" },
  { match: /Cargando resultados.../g, replace: "Loading results..." },
  { match: /Garantía de Privacidad/g, replace: "Privacy Guarantee" },
  { match: /Esta plataforma utiliza/g, replace: "This platform uses" },
  { match: /pruebas de conocimiento cero/g, replace: "zero-knowledge proofs" },
  { match: /\ y\ /g, replace: " and " },
  { match: /contratos inteligentes/g, replace: "smart contracts" },
  { match: /para asegurar que tu voto es 100% anónimo\. El sistema puede verificar QUE tienes derecho a votar sin revelar QUIÉN eres ni QUÉ has votado\./g, replace: "to ensure your vote is 100% anonymous. The system can verify THAT you have the right to vote without revealing WHO you are or WHAT you voted for." },
  { match: /Volver al Dashboard/g, replace: "Back to Dashboard" }
]);
