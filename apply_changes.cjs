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
// AdminPanel.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/AdminPanel.jsx'), [
  { match: /Panel de Administración/g, replace: "Administration Panel" },
  { match: /Gestiona usuarios, votaciones y auditoría del sistema/g, replace: "Manage users, elections and system audit" },
  { match: /"Solicitudes"/g, replace: "\"Requests\"" },
  { match: /"Usuarios"/g, replace: "\"Users\"" },
  { match: /"Votaciones"/g, replace: "\"Elections\"" },
  { match: /"Estadísticas"/g, replace: "\"Statistics\"" },
  { match: /Super administrador — Acceso completo a todos los dominios/g, replace: "Super Administrator — Full access to all domains" },
  { match: /Mostrando datos del dominio /g, replace: "Showing data for domain " },
  
  // Dashboard Metrics
  { match: /Total Usuarios/g, replace: "Total Users" },
  { match: /Estudiantes/g, replace: "Students" },
  
  // Users form
  { match: /Crear Nuevo Usuario/g, replace: "Create New User" },
  { match: /Crear Usuario/g, replace: "Create User" },
  { match: /"Nombre Completo"/g, replace: "\"Full Name\"" },
  { match: /"ID Estudiante"/g, replace: "\"Student ID\"" },
  { match: /"Contraseña"/g, replace: "\"Password\"" },
  { match: /Usuarios Registrados/g, replace: "Registered Users" },
  { match: />Nombre</g, replace: ">Name<" },
  { match: />Rol</g, replace: ">Role<" },
  { match: />Acción</g, replace: ">Action<" },
  { match: /Eliminar este usuario\?/g, replace: "Delete this user?" },
  { match: /Eliminar/g, replace: "Delete" },
  { match: /Voter \/ Estudiante/g, replace: "Voter" },
  { match: /Administrador de Dominio/g, replace: "Domain Admin" },
  
  // Elections form
  { match: /Crear Nueva Votación/g, replace: "Create New Election" },
  { match: /Nombre de la votación/g, replace: "Election Name" },
  { match: /"Descripción"/g, replace: "\"Description\"" },
  { match: />Candidatos</g, replace: ">Candidates<" },
  { match: /\+ Añadir/g, replace: "+ Add" },
  { match: /Nombre del candidato/g, replace: "Candidate Name" },
  { match: /Descripción breve.../g, replace: "Brief description..." },
  { match: /Crear Votación/g, replace: "Create Election" },
  
  // Elections List
  { match: /Votaciones Registradas/g, replace: "Registered Elections" },
  { match: /candidatos/g, replace: "candidates" },
  { match: /Inicia:/g, replace: "Starts:" },
  { match: /Termina:/g, replace: "Ends:" },
  { match: /✓ Visible/g, replace: "✓ Visible" },
  { match: /⊘ Oculta/g, replace: "⊘ Hidden" },
  { match: /⚙️ Gestionar Censo/g, replace: "⚙️ Manage Census" },
  { match: /Añadir votante/g, replace: "Add voter" },
  { match: /Añadir dominio/g, replace: "Add domain" },
  
  // Inbox
  { match: /Solicitudes de Registro Pendientes/g, replace: "Pending Registration Requests" },
  { match: /No hay solicitudes pendientes/g, replace: "No pending requests" },
  { match: /Fecha Solicitada/g, replace: "Request Date" },
  { match: /Se generará una contraseña temporal automáticamente/g, replace: "A temporary password will be generated automatically" },
  { match: /✅ Aprobar/g, replace: "✅ Approve" },
  { match: /❌ Rechazar/g, replace: "❌ Reject" },
  { match: /Copiar/g, replace: "Copy" },
  { match: /Contraseña temporal:/g, replace: "Temporary password:" },
  { match: /Solicitudes Procesadas/g, replace: "Processed Requests" },
  { match: /✅ Aprobado/g, replace: "✅ Approved" },
  { match: /❌ Rechazado/g, replace: "❌ Rejected" },

  // Loaders & Feedback
  { match: /Cargando/g, replace: "Loading" },
  { match: /Creando.../g, replace: "Creating..." },
  { match: /Usuario creado exitosamente/g, replace: "User created successfully" },
  { match: /Votación creada exitosamente/g, replace: "Election created successfully" },
  { match: /Solicitud aprobada/g, replace: "Request approved" },
  { match: /Solicitud rechazada/g, replace: "Request rejected" },
  { match: /Votante añadido al censo/g, replace: "Voter added to census" },
  { match: /Dominio añadido al censo/g, replace: "Domain added to census" },

  // Stats
  { match: /Votantes por Votación/g, replace: "Voters by Election" },
  { match: /votantes/g, replace: "voters" },
]);

// Special manual fix for AdminPanel.jsx getElectionStatus and badges (Change 7)
let adminContent = fs.readFileSync(path.join(__dirname, 'frontend/src/pages/AdminPanel.jsx'), 'utf8');

// Replace getElectionStatus logic
adminContent = adminContent.replace(
  /const getElectionStatus = \(election\) => \{[\s\S]*?\};/,
  `const getElectionStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    const start = election.start_time || election.startTime;
    const end = election.end_time || election.endTime;
    if (election.is_active && now >= start && now <= end) return 'active';
    if (now < start) return 'upcoming';
    return 'closed';
  };`
);

// Replace status badge logic
adminContent = adminContent.replace(
  /status === 'Activa' \? "bg-yellow-100 text-yellow-800" :[\s\S]*?"bg-slate-100 text-slate-800"/,
  `status === 'active' ? "bg-emerald-100 text-emerald-800" :
   status === 'upcoming' ? "bg-blue-100 text-blue-800" :
   "bg-slate-100 text-slate-800"`
);

// Replace `{status}` rendering to capitalize
adminContent = adminContent.replace(
  /\{status\}/,
  `{status.toUpperCase()}`
);

fs.writeFileSync(path.join(__dirname, 'frontend/src/pages/AdminPanel.jsx'), adminContent);

// ==========================================
// Dashboard.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/Dashboard.jsx'), [
  { match: /Panel de Votación/g, replace: "Voting Dashboard" },
  { match: /Bienvenido,/g, replace: "Welcome," },
  { match: /Rol:/g, replace: "Role:" },
  { match: /No hay elecciones asignadas/g, replace: "No elections assigned" },
  { match: /Actualmente no tienes permisos para participar[\s\S]*?solicita acceso al administrador./g, replace: "You currently don't have permissions to participate in any active elections. If you believe this is an error, please contact your domain administrator." },
  { match: /"Activa"/g, replace: "\"Active\"" },
  { match: /"Cerrada"/g, replace: "\"Closed\"" },
  { match: /Inicia:/g, replace: "Starts:" },
  { match: /Termina:/g, replace: "Ends:" },
  { match: /Estado:/g, replace: "Status:" },
  { match: /✓ Votado/g, replace: "✓ Voted" },
  { match: /Votar/g, replace: "Vote" },
  { match: /Ver Resultados/g, replace: "View Results" },
  { match: /Recargar/g, replace: "Reload" }
]);

// ==========================================
// VotingBooth.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/VotingBooth.jsx'), [
  { match: /Generando prueba/g, replace: "Generating proof" },
  { match: /Enviando a blockchain/g, replace: "Sending to blockchain" },
  { match: /Confirmando/g, replace: "Confirming" },
  { match: /¡Voto registrado!/g, replace: "Vote registered!" },
  { match: /Ya has votado en esta elección/g, replace: "You have already voted in this election" },
  { match: /Cabina de Votación/g, replace: "Voting Booth" },
  { match: /Selecciona una opción y confirma tu voto/g, replace: "Select an option and confirm your vote" },
  { match: /Volver al Dashboard/g, replace: "Back to Dashboard" },
  { match: /Voto registrado/g, replace: "Vote registered" },
  { match: /¡Tu voto ha sido procesado e insertado en la blockchain con éxito!/g, replace: "Your vote has been processed and successfully recorded on the blockchain!" },
  { match: /ID de Transacción:/g, replace: "Transaction Hash:" },
  { match: /Ver resultados/g, replace: "View Results" },
  { match: /Blockchain no disponible/g, replace: "Blockchain unavailable" },
  { match: /Volver a intentar/g, replace: "Retry connection" },
  { match: /Emitir Voto Seguro/g, replace: "Cast Secure Vote" },
  { match: /Cargando elección.../g, replace: "Loading election..." },
  { match: /Error cargando elección/g, replace: "Error loading election" },
  { match: /Procesando.../g, replace: "Processing..." },
  { match: /VOTO EMITIDO/g, replace: "VOTE CAST" }
]);

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
  { match: /y/g, replace: "and" },
  { match: /contratos inteligentes/g, replace: "smart contracts" },
  { match: /para asegurar que tu voto es 100% anónimo. El sistema puede verificar QUE tienes derecho a votar sin revelar QUIÉN eres ni QUÉ has votado./g, replace: "to ensure your vote is 100% anonymous. The system can verify THAT you have the right to vote without revealing WHO you are or WHAT you voted for." },
  { match: /Volver al Dashboard/g, replace: "Back to Dashboard" }
]);

// ==========================================
// RegisterRequest.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/RegisterRequest.jsx'), [
  { match: /Solicitar Acceso al VTB/g, replace: "Request Access to VTB" },
  { match: /"Nombre Completo"/g, replace: "\"Full Name\"" },
  { match: /Ej: Juan García López/g, replace: "e.g., John Smith" },
  { match: /"Email Institucional"/g, replace: "\"Institutional Email\"" },
  { match: /ID de Estudiante/g, replace: "Student ID" },
  { match: /Enviando.../g, replace: "Submitting..." },
  { match: /Enviar Solicitud/g, replace: "Submit Request" },
  { match: /Volver al Login/g, replace: "Back to Login" },
  { match: /Solicitud Recibida/g, replace: "Request Received" },
  { match: /Tu solicitud será revisada por el administrador de tu institución. Recibirás un correo cuando sea aprobada./g, replace: "Your request will be reviewed by your institution administrator. You will receive an email when it is approved." }
]);

// ==========================================
// Login.jsx
// ==========================================
applyChanges(path.join(__dirname, 'frontend/src/pages/Login.jsx'), [
  { match: /Accede con tus credenciales/g, replace: "Sign in with your credentials" },
  { match: /"Tu email institucional"/g, replace: "\"Your institutional email\"" },
  { match: /Ingresar/g, replace: "Sign In" },
  { match: /Continuar con Google/g, replace: "Continue with Google" }, // User said keep, but ensure it's correct
  { match: /¿No tienes cuenta\?/g, replace: "Don't have an account?" },
  { match: /Solicitar acceso/g, replace: "Request access" },
  { match: /Cuentas de Prueba/g, replace: "Test Accounts" },
  { match: /🔒 Administrador Global/g, replace: "🔒 Global Admin" },
  { match: /"Contraseña"/g, replace: "\"Password\"" },
  { match: /Autenticando.../g, replace: "Authenticating..." },
  { match: /Dominio Universitario/g, replace: "University Domain" },
]);

console.log("All UI translations completed!");
