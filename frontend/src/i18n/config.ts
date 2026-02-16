import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/**
 * @title i18n Configuration - VTB Frontend
 * @author Senior Web3 Architect
 * @dev Internacionalización con soporte Inglés/Español
 *
 * USO:
 * import { useTranslation } from 'react-i18next';
 * const { t, i18n } = useTranslation();
 *
 * Mostrar texto: {t('key')}
 * Cambiar idioma: i18n.changeLanguage('es')
 */

const resources = {
  en: {
    translation: {
      // GENERALES
      appName: "VTB",
      appTagline: "Vote Through Blockchain",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      submit: "Submit",
      logout: "Logout",

      // NAVBAR
      darkMode: "Dark Mode",
      lightMode: "Light Mode",
      language: "Language",
      english: "English",
      spanish: "Español",

      // LANDING PAGE
      landing: {
        heroTitle: "End-to-End Voting",
        heroSubtitle: "Secret. Auditable. Immutable.",
        heroDescription:
          "VTB combines Web2 authentication with Web3 blockchain technology to ensure secure, anonymous and transparent voting.",

        features: {
          title: "Why VTB?",
          authentication: {
            title: "Secure Authentication",
            desc: "Database-backed user verification with cryptographic credentials",
          },
          anonymity: {
            title: "Perfect Anonymity",
            desc: "Votes are registered with nullifiers - no personal data on blockchain",
          },
          immutability: {
            title: "Immutable Records",
            desc: "Smart contracts ensure votes cannot be altered or deleted",
          },
          auditability: {
            title: "Public Auditability",
            desc: "Blockchain transparency without revealing voter identities",
          },
        },

        about: {
          title: "What is VTB?",
          description1: "VTB (Vote Through Blockchain) is a revolutionary voting system that combines the security and ease of use of traditional platforms (Web2) with the transparency and immutability of blockchain technology (Web3).",
          description2: "Our goal is to democratize electronic voting, ensuring that each vote is counted only once, maintaining voter anonymity and allowing complete public audit of the process.",
          description3: "Designed for universities, organizations and governments seeking modern, secure and verifiable electoral processes.",
          
          whyVtb: "Why VTB?",
          benefit1Title: "Guaranteed Security",
          benefit1Desc: "Verified authentication + blockchain = impossible to duplicate votes",
          benefit2Title: "Perfect Anonymity",
          benefit2Desc: "Your vote is counted without revealing your identity",
          benefit3Title: "Total Transparency",
          benefit3Desc: "Anyone can audit the result on the blockchain",
          benefit4Title: "Fast and Accessible",
          benefit4Desc: "Simple interface, instant results",
        },

        useCases: {
          title: "Use Cases",
          universities: {
            title: "Universities",
            description: "Elections of class delegates, exam changes, student representatives. Secure and transparent for the entire community.",
          },
          organizations: {
            title: "Organizations",
            description: "Internal voting, corporate decisions, board elections. Immediate and auditable results.",
          },
          governments: {
            title: "Governments",
            description: "Referendums, citizen consultations, local voting. Maximum security and public confidence.",
          },
        },

        cta: "Start Voting Now",
        documentation: "Documentation",
      },

      // LOGIN
      login: {
        title: "University Portal",
        email: "Email",
        password: "Password",
        login: "Login",
        loginSuccess: "Welcome back!",
        loginError: "Invalid credentials",
        noAccount: "Don't have an account?",
        registerHere: "Register here",
      },

      // REGISTER
      register: {
        title: "Create Account",
        name: "Full Name",
        email: "University Email",
        password: "Password",
        studentId: "Student ID",
        register: "Create Account",
        registerSuccess: "Account created successfully",
        registerError: "Error creating account",
        haveAccount: "Already have an account?",
        loginHere: "Login here",
      },

      // ADMIN PANEL
      admin: {
        title: "Administration Panel",
        subtitle: "Manage users, elections and audit system",
        dashboard: "Dashboard",
        requests: "Requests",
        users: "Users",
        elections: "Elections",
        statistics: "Statistics",
        audit: "Audit",
        totalUsers: "Total Users",
        admins: "Admins",
        students: "Students",
        totalElections: "Elections",
        nullifiers: "Nullifiers",
        createNewUser: "Create New User",
        createNewElection: "Create New Election",
        registeredUsers: "Registered Users",
        registeredElections: "Registered Elections",
        pendingRequests: "Pending Requests",
        noPendingRequests: "No pending requests",
        registeredUserEmail: "Email",
        registeredUserName: "Name",
        registeredUserRole: "Role",
        action: "Action",
        delete: "Delete",
        active: "Active",
        inactive: "Inactive",
        auditNullifiers: "Audit Log",
        auditUser: "User",
        auditEmail: "Email",
        auditElection: "Election",
        auditDate: "Date",
        approveRequest: "Approve",
        rejectRequest: "Reject",
        temporaryPassword: "Temporary Password",
        registerRequests: "Registration Requests",
        approveRequestTitle: "Approve Request",
        successApproved: "Request approved and user created",
        successRejected: "Request rejected",
        errorApproving: "Error approving request",
        errorRejecting: "Error rejecting request",
        processedRequests: "Processed Requests",
        approved: "Approved",
        rejected: "Rejected",
      },

      // VOTING DASHBOARD
      dashboard: {
        title: "Voting Dashboard",
        welcome: "Welcome",
        availableElections: "Available Elections",
        noElections: "No active elections at the moment",
        voteNow: "Vote Now",
        results: "View Results",
        closed: "Closed",
        active: "Active",
        coming: "Coming Soon",
      },

      // VOTING BOOTH
      votingBooth: {
        title: "Voting Booth",
        selectOption: "Select an option",
        confirm: "Confirm Vote",
        cancel: "Cancel",
        confirmMessage: "Are you sure? Your vote is final and anonymous.",
        casting: "Casting vote...",
        success: "Vote registered successfully!",
        error: "Error registering vote",
        txHashLabel: "Transaction Hash:",
        nullifierLabel: "Voter ID (Nullifier):",
        anonymousInfo:
          "Only nullifier and encrypted hash are stored on blockchain.",
      },

      // LIVE FEED
      liveFeed: {
        title: "Live Vote Stream",
        subtitle: "Real-time transparency - only showing anonymized data",
        nullifier: "Voter ID",
        txHash: "TX Hash",
        timestamp: "Time",
        noVotes: "Waiting for votes...",
        votesCount: "Total Votes",
      },

      // RESULTS
      results: {
        title: "Results",
        finalResults: "Final Results",
        totalVotes: "Total Votes",
        percentage: "Percentage",
        option: "Option",
        auditTrail: "Audit Trail",
        verifyOnBlockchain: "Verify on Blockchain",
      },

      // ERRORS
      errors: {
        notFound: "Not Found",
        unauthorized: "Unauthorized",
        forbidden: "Forbidden",
        serverError: "Server Error",
        networkError: "Network Error",
        blockchainError: "Blockchain Connection Error",
        pleaseCheckConnection: "Please check your connection",
        tryAgain: "Try Again",
      },
    },
  },

  es: {
    translation: {
      // GENERALES
      appName: "VTB",
      appTagline: "Votación A Través de Blockchain",
      loading: "Cargando...",
      error: "Error",
      success: "Éxito",
      cancel: "Cancelar",
      submit: "Enviar",
      logout: "Cerrar sesión",

      // NAVBAR
      darkMode: "Modo Oscuro",
      lightMode: "Modo Claro",
      language: "Idioma",
      english: "English",
      spanish: "Español",

      // LANDING PAGE
      landing: {
        heroTitle: "Votación De Principio a Fin",
        heroSubtitle: "Secreta. Auditable. Inmutable.",
        heroDescription:
          "VTB combina autenticación Web2 con tecnología blockchain Web3 para garantizar votación segura, anónima y transparente.",

        features: {
          title: "¿Por qué VTB?",
          authentication: {
            title: "Autenticación Segura",
            desc: "Verificación de usuario respaldada por base de datos con credenciales criptográficas",
          },
          anonymity: {
            title: "Anonimato Perfecta",
            desc: "Los votos se registran con nullifiers - sin datos personales en blockchain",
          },
          immutability: {
            title: "Registros Immutables",
            desc: "Los contratos inteligentes garantizan que los votos no pueden ser alterados",
          },
          auditability: {
            title: "Auditoría Pública",
            desc: "Transparencia blockchain sin revelar identidades de votantes",
          },
        },

        about: {
          title: "¿Qué es VTB?",
          description1: "VTB (Vote Through Blockchain) es un sistema de votación revolucionario que combina la seguridad y facilidad de uso de plataformas tradicionales (Web2) con la transparencia e inmutabilidad de la tecnología blockchain (Web3).",
          description2: "Nuestro objetivo es democratizar el voto electrónico, garantizando que cada voto sea contado una sola vez, manteniendo el anonimato del votante y permitiendo una auditoría pública completa del proceso.",
          description3: "Diseñado para universidades, organizaciones y gobiernos que buscan procesos electorales modernos, seguros y verificables.",
          
          whyVtb: "¿Por qué VTB?",
          benefit1Title: "Seguridad Garantizada",
          benefit1Desc: "Autenticación verificada + blockchain = imposible duplicar votos",
          benefit2Title: "Anonimato Perfecto",
          benefit2Desc: "Tu voto se cuenta sin revelar tu identidad",
          benefit3Title: "Transparencia Total",
          benefit3Desc: "Cualquiera puede auditar el resultado en la blockchain",
          benefit4Title: "Rápido y Accesible",
          benefit4Desc: "Interfaz simple, resultados instantáneos",
        },

        useCases: {
          title: "Casos de Uso",
          universities: {
            title: "Universidades",
            description: "Elecciones de delegados de clase, cambios en exámenes, representantes estudiantiles. Seguro y transparente para toda la comunidad.",
          },
          organizations: {
            title: "Organizaciones",
            description: "Votaciones internas, decisiones corporativas, elecciones de junta directiva. Resultados inmediatos y auditables.",
          },
          governments: {
            title: "Gobiernos",
            description: "Referéndums, consultas ciudadanas, votaciones locales. Máxima seguridad y confianza pública.",
          },
        },

        cta: "Comienza a Votar Ahora",
        documentation: "Documentación",
      },

      // LOGIN
      login: {
        title: "Portal Universitario",
        email: "Correo Electrónico",
        password: "Contraseña",
        login: "Iniciar Sesión",
        loginSuccess: "¡Bienvenido de vuelta!",
        loginError: "Credenciales inválidas",
        noAccount: "¿No tienes cuenta?",
        registerHere: "Regístrate aquí",
      },

      // REGISTER
      register: {
        title: "Crear Cuenta",
        name: "Nombre Completo",
        email: "Correo Universitario",
        password: "Contraseña",
        studentId: "Número de Estudiante",
        register: "Crear Cuenta",
        registerSuccess: "Cuenta creada exitosamente",
        registerError: "Error al crear cuenta",
        haveAccount: "¿Ya tienes cuenta?",
        loginHere: "Inicia sesión aquí",
      },

      // ADMIN PANEL
      admin: {
        title: "Panel de Administración",
        subtitle: "Gestiona usuarios, votaciones y auditoría del sistema",
        dashboard: "Dashboard",
        requests: "Solicitudes",
        users: "Usuarios",
        elections: "Votaciones",
        statistics: "Estadísticas",
        audit: "Auditoría",
        totalUsers: "Total Usuarios",
        admins: "Administradores",
        students: "Estudiantes",
        totalElections: "Votaciones",
        nullifiers: "Nullifiers",
        createNewUser: "Crear Nuevo Usuario",
        createNewElection: "Crear Nueva Votación",
        registeredUsers: "Usuarios Registrados",
        registeredElections: "Votaciones Registradas",
        pendingRequests: "Solicitudes Pendientes",
        noPendingRequests: "No hay solicitudes pendientes",
        registeredUserEmail: "Correo",
        registeredUserName: "Nombre",
        registeredUserRole: "Rol",
        action: "Acción",
        delete: "Eliminar",
        active: "Activa",
        inactive: "Inactiva",
        auditNullifiers: "Auditoría de Nullifiers",
        auditUser: "Usuario",
        auditEmail: "Correo",
        auditElection: "Votación",
        auditDate: "Fecha",
        approveRequest: "Aprobar",
        rejectRequest: "Rechazar",
        temporaryPassword: "Contraseña Temporal para Crear Usuario",
        registerRequests: "Solicitudes de Registro Pendientes",
        approveRequestTitle: "Aprobar Solicitud",
        successApproved: "Solicitud aprobada y usuario creado",
        successRejected: "Solicitud rechazada",
        errorApproving: "Error al aprobar solicitud",
        errorRejecting: "Error al rechazar solicitud",
        processedRequests: "Solicitudes Procesadas",
        approved: "Aprobado",
        rejected: "Rechazado",
      },

      // VOTING DASHBOARD
      dashboard: {
        title: "Panel de Votación",
        welcome: "Bienvenido",
        availableElections: "Elecciones Disponibles",
        noElections:
          "No hay elecciones activas en este momento",
        voteNow: "Votar Ahora",
        results: "Ver Resultados",
        closed: "Cerrada",
        active: "Activa",
        coming: "Próximamente",
      },

      // VOTING BOOTH
      votingBooth: {
        title: "Cabina de Votación",
        selectOption: "Selecciona una opción",
        confirm: "Confirmar Voto",
        cancel: "Cancelar",
        confirmMessage:
          "¿Estás seguro? Tu voto es final y anónimo.",
        casting: "Registrando voto...",
        success: "¡Voto registrado exitosamente!",
        error: "Error al registrar voto",
        txHashLabel: "Hash de Transacción:",
        nullifierLabel: "ID de Votante (Nullifier):",
        anonymousInfo:
          "Solo se almacenan nullifier y hash cifrado en blockchain.",
      },

      // LIVE FEED
      liveFeed: {
        title: "Flujo Directo de Votos",
        subtitle:
          "Transparencia en tiempo real - solo mostrando datos anonimizados",
        nullifier: "ID de Votante",
        txHash: "Hash TX",
        timestamp: "Hora",
        noVotes: "Esperando votos...",
        votesCount: "Votos Totales",
      },

      // RESULTS
      results: {
        title: "Resultados",
        finalResults: "Resultados Finales",
        totalVotes: "Votos Totales",
        percentage: "Porcentaje",
        option: "Opción",
        auditTrail: "Pista de Auditoría",
        verifyOnBlockchain: "Verificar en Blockchain",
      },

      // ERRORS
      errors: {
        notFound: "No Encontrado",
        unauthorized: "No Autorizado",
        forbidden: "Prohibido",
        serverError: "Error del Servidor",
        networkError: "Error de Red",
        blockchainError: "Error de Conexión a Blockchain",
        pleaseCheckConnection:
          "Por favor verifica tu conexión",
        tryAgain: "Intentar de Nuevo",
      },
    },
  },
};

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  detection: {
    order: ["localStorage", "navigator", "htmlTag"],
    caches: ["localStorage"],
  },
});

export default i18n;
