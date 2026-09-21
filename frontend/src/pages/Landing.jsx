import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { DemoModeButton } from "../components/DemoModeButton";
import { DemoLoginModal } from "../components/DemoLoginModal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { apiFetch } from "../utils/apiClient";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: "easeOut" } },
};


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
    apiFetch('/api/stats')
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
    { key: "highland", logo: "/logos/highland.png", fallback: "HS", name: "Highlands School", domain: "@highlands.edu" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <DemoLoginModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
      <Navbar />

      <section
        className={`relative overflow-hidden border-b ${
          theme === "dark"
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-warm-200"
        }`}
      >

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8"
        >
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              variants={itemVariants}
              className={`mb-8 inline-flex items-center gap-2 rounded border px-4 py-1.5 text-sm font-medium ${
                theme === "dark"
                  ? "border-brand-600/30 bg-brand-600/10 text-brand-300"
                  : "border-brand-200 bg-brand-50 text-brand-700"
              }`}
            >
              {t("landing.poweredBySepolia")}
            </motion.div>

            <h1
              className={`mb-6 text-4xl font-bold leading-tight sm:text-6xl ${
                theme === "dark" ? "text-white" : "text-slate-900"
              }`}
            >
              {headlineWords.map((word, index) => (
                <motion.span
                  key={word}
                  variants={itemVariants}
                  className={index === 1 ? "block text-brand-600" : "block"}
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

            <motion.div variants={itemVariants} className="mb-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center flex-wrap">
              {!isAuthenticated && (
                <button
                  onClick={() => setDemoOpen(true)}
                  className="rounded bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  Try Demo
                </button>
              )}
              <button
                onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
                className={`rounded px-8 py-4 text-base font-semibold transition-colors ${
                  isAuthenticated
                    ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                    : theme === "dark"
                    ? "border border-white/20 text-white hover:border-white/40 hover:bg-white/5"
                    : "border border-slate-300 text-slate-800 hover:border-brand-400 hover:bg-slate-50"
                }`}
              >
                {isAuthenticated ? t("landing.startVoting") : "Sign In"}
              </button>
              <button
                onClick={() => navigate("/transparency")}
                className={`rounded border px-8 py-4 text-base font-semibold transition-colors ${
                  theme === "dark"
                    ? "border-white/20 text-white hover:border-white/40 hover:bg-white/5"
                    : "border-slate-300 text-slate-700 hover:border-brand-400 hover:bg-slate-50"
                }`}
              >
                {t("landing.viewPublicAudit")}
              </button>
              {isAuthenticated && (hasRole("admin") || hasRole("superadmin")) && (
                <button
                  onClick={() => navigate("/admin")}
                  className="rounded bg-emerald-700 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  {t("landing.adminPanel")}
                </button>
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="mb-10 flex items-center justify-center gap-6 sm:gap-10">
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
                className={`mx-auto max-w-xl rounded border p-3 ${
                  theme === "dark" ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
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
                    className={`flex-1 rounded border px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      theme === "dark"
                        ? "border-white/10 bg-slate-950/70 text-white placeholder-slate-500"
                        : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
                    }`}
                  />
                  <button
                    type="submit"
                    className={`rounded px-6 py-3 font-semibold transition-colors ${
                      theme === "dark" ? "bg-white text-slate-950 hover:bg-slate-100" : "bg-slate-900 text-white hover:bg-slate-800"
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

          {/* Right column removed — text-first hero */}
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

