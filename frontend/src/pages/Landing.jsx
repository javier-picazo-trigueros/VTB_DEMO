import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { DemoModeButton } from "../components/DemoModeButton";
import { DemoLoginModal } from "../components/DemoLoginModal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: "easeOut" } },
};

function BlockchainVisual({ theme }) {
  return (
    <div className="relative h-72 w-full">
      <style>{`
        @keyframes vtbPulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.35)); opacity: 0.78; }
          50% { filter: drop-shadow(0 0 18px rgba(6, 182, 212, 0.75)); opacity: 1; }
        }
        .vtb-node { animation: vtbPulse 2.7s ease-in-out infinite; }
        .vtb-node:nth-of-type(2) { animation-delay: 0.25s; }
        .vtb-node:nth-of-type(3) { animation-delay: 0.5s; }
        .vtb-node:nth-of-type(4) { animation-delay: 0.75s; }
      `}</style>
      <svg viewBox="0 0 420 220" className="h-full w-full" role="img" aria-label="Blockchain vote animation">
        <defs>
          <linearGradient id="vtb-node-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="vtb-success-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        {[70, 165, 260].map((x) => (
          <line
            key={x}
            x1={x}
            y1="110"
            x2={x + 75}
            y2="110"
            stroke={theme === "dark" ? "#3b82f6" : "#2563eb"}
            strokeWidth="2"
            strokeDasharray="5 5"
            opacity="0.75"
          />
        ))}
        {[
          { x: 35, label: "V" },
          { x: 130, label: "0x" },
          { x: 225, label: "OK" },
          { x: 320, label: "TX", success: true },
        ].map((node) => (
          <g key={node.x} className="vtb-node">
            <rect
              x={node.x}
              y="80"
              width="58"
              height="58"
              rx="14"
              fill={node.success ? "url(#vtb-success-gradient)" : "url(#vtb-node-gradient)"}
              stroke={node.success ? "#22c55e" : "#60a5fa"}
              strokeWidth="2"
            />
            <text x={node.x + 29} y="116" textAnchor="middle" fill="white" fontSize="16" fontWeight="700">
              {node.label}
            </text>
          </g>
        ))}
        <circle r="7" fill="#06b6d4">
          <animateMotion dur="3s" repeatCount="indefinite" path="M 64,110 L 160,110 L 255,110 L 350,110" />
        </circle>
      </svg>
    </div>
  );
}

export const Landing = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, hasRole } = useAuth();
  const { theme } = useTheme();
  const [domainInput, setDomainInput] = useState("");
  const [domainError, setDomainError] = useState("");
  const [stats, setStats] = useState(null);
  const [failedLogos, setFailedLogos] = useState({});
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/stats`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("stats failed"))))
      .then(setStats)
      .catch(() => {
        setStats({
          totalElections: 0,
          totalVotes: 0,
          activeInstitutions: 0,
          blockchainTransactions: 0,
        });
      });
  }, []);

  const handlePortalSubmit = (event) => {
    event.preventDefault();
    const trimmed = domainInput.trim().toLowerCase();
    if (!trimmed) {
      setDomainError(t("landing.domainRequired"));
      return;
    }
    if (!/^[a-z0-9-]+(\.([a-z0-9-]+))+$/.test(trimmed)) {
      setDomainError(t("landing.domainInvalid"));
      return;
    }
    setDomainError("");
    navigate(`/portal/${trimmed}`);
  };

  const headlineWords = [
    t("landing.heroWord1"),
    t("landing.heroWord2"),
    t("landing.heroWord3"),
  ];

  const heroStats = [
    { label: t("landing.statsElections"), value: stats?.totalElections },
    { label: t("landing.statsVotes"), value: stats?.totalVotes },
    { label: t("landing.statsInstitutions"), value: stats?.activeInstitutions },
  ];

  const howItWorks = [
    { number: "01", icon: "01", title: t("landing.step1Title"), text: t("landing.step1Text") },
    { number: "02", icon: "02", title: t("landing.step2Title"), text: t("landing.step2Text") },
    { number: "03", icon: "03", title: t("landing.step3Title"), text: t("landing.step3Text") },
  ];

  const blockchainCards = [
    { accent: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", title: t("landing.zeroTrustTitle"), text: t("landing.zeroTrustText") },
    { accent: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300", title: t("landing.privateTitle"), text: t("landing.privateText") },
    { accent: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300", title: t("landing.auditableTitle"), text: t("landing.auditableText") },
  ];

  const institutions = [
    { key: "ufv", logo: "/logos/ufv.png", fallback: "UFV", name: "Universidad Francisco de Vitoria", domain: "@ufv.es" },
    { key: "highland", logo: "/logos/highland.png", fallback: "HS", name: "Highlands School", domain: "@highland.edu" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <DemoLoginModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
      <Navbar />

      <section
        className={`relative overflow-hidden transition-colors duration-500 ${
          theme === "dark"
            ? "bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950"
            : "bg-gradient-to-br from-blue-50 via-white to-indigo-50"
        }`}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              theme === "dark"
                ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)"
                : "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.10) 1px, transparent 0)",
            backgroundSize: "36px 36px",
          }}
        />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8"
        >
          <div className="text-center lg:text-left">
            <motion.div
              variants={itemVariants}
              className={`mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
                theme === "dark"
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : "border-blue-400/50 bg-blue-100/70 text-blue-700"
              }`}
            >
              {t("landing.poweredBySepolia")}
            </motion.div>

            <h1
              className={`mb-6 text-5xl font-black leading-none sm:text-7xl ${
                theme === "dark" ? "text-white" : "text-slate-900"
              }`}
            >
              {headlineWords.map((word, index) => (
                <motion.span
                  key={word}
                  variants={itemVariants}
                  className={index === 1 ? "block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent" : "block"}
                >
                  {word}
                </motion.span>
              ))}
            </h1>

            <motion.p
              variants={itemVariants}
              className={`mx-auto mb-10 max-w-2xl text-xl leading-relaxed lg:mx-0 ${
                theme === "dark" ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {t("landing.heroSubtitleNew")}
            </motion.p>

            <motion.div variants={itemVariants} className="mb-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start flex-wrap">
              {!isAuthenticated && (
                <button
                  onClick={() => setDemoOpen(true)}
                  className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 hover:shadow-blue-500/40 flex items-center gap-2"
                >
                  🚀 Try Demo
                </button>
              )}
              <button
                onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
                className={`rounded-2xl px-8 py-4 text-lg font-bold transition ${
                  isAuthenticated
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
                    : theme === "dark"
                    ? "border border-white/20 text-white hover:border-white/40 hover:bg-white/5"
                    : "border border-slate-300 text-slate-800 hover:border-blue-400 hover:bg-white/70"
                }`}
              >
                {isAuthenticated ? t("landing.startVoting") : "Sign In"}
              </button>
              <button
                onClick={() => navigate("/transparency")}
                className={`rounded-2xl border px-8 py-4 text-lg font-bold transition ${
                  theme === "dark"
                    ? "border-white/20 text-white hover:border-white/40 hover:bg-white/5"
                    : "border-slate-300 text-slate-800 hover:border-blue-400 hover:bg-white/70"
                }`}
              >
                {t("landing.viewPublicAudit")}
              </button>
              {isAuthenticated && (hasRole("admin") || hasRole("superadmin")) && (
                <button
                  onClick={() => navigate("/admin")}
                  className="rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-emerald-500"
                >
                  {t("landing.adminPanel")}
                </button>
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="mb-10 flex items-center justify-center gap-6 sm:gap-10 lg:justify-start">
              {heroStats.map((item, index) => (
                <div
                  key={item.label}
                  className={`px-2 ${
                    index > 0
                      ? theme === "dark"
                        ? "border-l border-white/10 pl-6 sm:pl-10"
                        : "border-l border-slate-300 pl-6 sm:pl-10"
                      : ""
                  }`}
                >
                  {stats ? (
                    <p className={`text-3xl font-black ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                      {item.value ?? 0}
                    </p>
                  ) : (
                    <div className={`mx-auto h-9 w-16 animate-pulse rounded ${theme === "dark" ? "bg-white/10" : "bg-slate-300/60"}`} />
                  )}
                  <p className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>{item.label}</p>
                </div>
              ))}
            </motion.div>

            {!isAuthenticated && (
              <motion.form
                variants={itemVariants}
                onSubmit={handlePortalSubmit}
                className={`mx-auto max-w-xl rounded-2xl border p-3 backdrop-blur lg:mx-0 ${
                  theme === "dark" ? "border-white/10 bg-white/10" : "border-slate-300/50 bg-white/60"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(event) => {
                      setDomainInput(event.target.value);
                      setDomainError("");
                    }}
                    placeholder={t("landing.domainPlaceholder")}
                    className={`flex-1 rounded-xl border px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      theme === "dark"
                        ? "border-white/10 bg-slate-950/70 text-white placeholder-slate-500"
                        : "border-slate-300 bg-white/90 text-slate-900 placeholder-slate-400"
                    }`}
                  />
                  <button
                    type="submit"
                    className={`rounded-xl px-6 py-3 font-bold transition ${
                      theme === "dark" ? "bg-white text-slate-950 hover:bg-blue-50" : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {t("landing.portalButton")}
                  </button>
                </div>
                {domainError && (
                  <p className={`mt-2 text-left text-xs ${theme === "dark" ? "text-red-300" : "text-red-600"}`}>
                    {domainError}
                  </p>
                )}
              </motion.form>
            )}
          </div>

          <motion.div variants={itemVariants} className="hidden lg:block">
            <BlockchainVisual theme={theme} />
          </motion.div>
        </motion.div>
      </section>

      <section className="bg-white py-24 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-4xl font-black text-slate-900 dark:text-white">{t("landing.howTitle")}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {howItWorks.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative rounded-2xl border border-slate-200 bg-white p-8 transition hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 text-5xl font-black leading-none text-blue-600/20 dark:text-blue-500/20">{step.number}</div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {step.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-24 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-4xl font-black text-slate-900 dark:text-white">{t("landing.whyBlockchain")}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {blockchainCards.map((card, index) => (
              <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black ${card.accent}`}>
                  {index + 1}
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">{card.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-24 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-4xl font-black text-slate-900 dark:text-white">{t("landing.trustedBy")}</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {institutions.map((institution) => (
              <div
                key={institution.key}
                className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:w-72"
              >
                <div className="mb-4 flex h-16 items-center justify-center">
                  {failedLogos[institution.key] ? (
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {institution.fallback}
                    </span>
                  ) : (
                    <img
                      src={institution.logo}
                      alt={institution.name}
                      className="mx-auto max-h-16 object-contain"
                      onError={() => setFailedLogos((previous) => ({ ...previous, [institution.key]: true }))}
                    />
                  )}
                </div>
                <h3 className="mb-3 font-bold text-slate-900 dark:text-white">{institution.name}</h3>
                <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {institution.domain}
                </span>
              </div>
            ))}
            <button
              onClick={() => navigate("/register-request")}
              className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500 sm:w-72"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                +
              </div>
              <h3 className="mb-3 font-bold text-slate-900 dark:text-white">{t("landing.yourInstitution")}</h3>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{t("landing.contactUs")}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-8 dark:bg-blue-700">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 text-center sm:px-6 md:grid-cols-4 lg:px-8">
          {[
            { value: stats?.totalElections, label: t("landing.statsElections") },
            { value: stats?.totalVotes, label: t("landing.statsVotes") },
            { value: stats?.activeInstitutions, label: t("landing.statsInstitutions") },
            { value: stats?.blockchainTransactions, label: t("landing.statsTransactions") },
          ].map((item) => (
            <div key={item.label}>
              {stats ? (
                <p className="text-3xl font-black text-white">{item.value ?? 0}</p>
              ) : (
                <div className="mx-auto h-9 w-16 animate-pulse rounded bg-white/20" />
              )}
              <p className="text-sm text-white/80">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 text-center md:grid-cols-3 md:text-left">
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">VTB</p>
              <p className="text-sm text-slate-500 dark:text-slate-500">{t("appTagline")}</p>
            </div>
            <div className="flex justify-center gap-5 text-sm">
              <button onClick={() => navigate("/landing")} className="text-slate-600 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-white">
                {t("landing.home")}
              </button>
              <button onClick={() => navigate("/transparency")} className="text-slate-600 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-white">
                {t("landing.transparency")}
              </button>
              <button onClick={() => navigate("/register-request")} className="text-slate-600 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-white">
                {t("landing.requestAccess")}
              </button>
            </div>
            <div className="md:text-right">
              <p className="text-sm text-slate-600 dark:text-slate-300">{t("landing.builtOnSepolia")}</p>
            </div>
          </div>
          <div className="mt-10 border-t border-slate-200 pt-6 text-center dark:border-slate-800">
            <p className="text-xs text-slate-500">{t("landing.footerBottom")}</p>
          </div>
        </div>
      </footer>

      <DemoModeButton />
    </div>
  );
};

export default Landing;
