import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

/**
 * @title Landing Page - VTB Frontend
 * @author Senior Web3 Architect
 * @dev Landing page espectacular que explica la propuesta de valor
 *
 * PROPUESTA DE VALOR:
 * "Voto E2E, Secreto y Auditable"
 * - End-to-End: Desde autenticación hasta verificación
 * - Secreto: Anonimato garantizado con nullifiers
 * - Auditable: Transparencia blockchain sin revelar identidad
 */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

export const Landing = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, hasRole } = useAuth();

  const handleStartVoting = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      {/* HERO SECTION */}
      <motion.section
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32"
      >
        <div className="text-center">
          {/* Título Principal */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6 leading-tight"
          >
            {t("landing.heroTitle")}
          </motion.h1>

          {/* Subtítulo */}
          <motion.p
            variants={itemVariants}
            className="text-2xl sm:text-3xl font-semibold text-slate-600 dark:text-slate-400 mb-8"
          >
            {t("landing.heroSubtitle")}
          </motion.p>

          {/* Descripción */}
          <motion.p
            variants={itemVariants}
            className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            {t("landing.heroDescription")}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button
              onClick={handleStartVoting}
              className="px-8 py-4 rounded-lg bg-gradient-hero text-white font-semibold text-lg hover:shadow-lg transition"
            >
              {t("landing.cta")}
            </button>
            {isAuthenticated && (hasRole('admin') || hasRole('superadmin')) && (
              <button
                onClick={() => navigate('/admin')}
                className="px-8 py-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-lg hover:shadow-lg transition"
              >
                Admin Panel
              </button>
            )}
            <button
              onClick={() => {}}
              className="px-8 py-4 rounded-lg border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white font-semibold text-lg hover:border-slate-400 dark:hover:border-slate-500 transition"
            >
              {t("landing.documentation")}
            </button>
          </motion.div>
        </div>
      </motion.section>

      {/* FEATURES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 border-t border-slate-200 dark:border-slate-700">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-3xl sm:text-4xl font-bold text-center text-slate-900 dark:text-white mb-16"
        >
          {t("landing.features.title")}
        </motion.h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Feature 1: Seguridad */}
          <FeatureCard
            icon="🔐"
            title={t("landing.features.authentication.title")}
            description={t("landing.features.authentication.desc")}
            index={0}
          />

          {/* Feature 2: Anonimato */}
          <FeatureCard
            icon="🎭"
            title={t("landing.features.anonymity.title")}
            description={t("landing.features.anonymity.desc")}
            index={1}
          />

          {/* Feature 3: Inmutabilidad */}
          <FeatureCard
            icon="⛓️"
            title={t("landing.features.immutability.title")}
            description={t("landing.features.immutability.desc")}
            index={2}
          />

          {/* Feature 4: Auditoría */}
          <FeatureCard
            icon="✅"
            title={t("landing.features.auditability.title")}
            description={t("landing.features.auditability.desc")}
            index={3}
          />
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 border-t border-slate-200 dark:border-slate-700">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-12 items-center"
        >
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-6">
              {t("landing.about.title")}
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              {t("landing.about.description1")}
            </p>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              {t("landing.about.description2")}
            </p>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              {t("landing.about.description3")}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-8 border border-emerald-200 dark:border-slate-700"
          >
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
              {t("landing.about.whyVtb")}
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {t("landing.about.benefit1Title")}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("landing.about.benefit1Desc")}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">🎭</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {t("landing.about.benefit2Title")}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("landing.about.benefit2Desc")}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {t("landing.about.benefit3Title")}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("landing.about.benefit3Desc")}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {t("landing.about.benefit4Title")}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("landing.about.benefit4Desc")}
                  </p>
                </div>
              </li>
            </ul>
          </motion.div>
        </motion.div>
      </section>

      {/* USE CASES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 border-t border-slate-200 dark:border-slate-700">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-3xl sm:text-4xl font-bold text-center text-slate-900 dark:text-white mb-16"
        >
          {t("landing.useCases.title")}
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8">
          <UseCase
            icon="🏫"
            title={t("landing.useCases.universities.title")}
            description={t("landing.useCases.universities.description")}
            index={0}
          />
          <UseCase
            icon="🏢"
            title={t("landing.useCases.organizations.title")}
            description={t("landing.useCases.organizations.description")}
            index={1}
          />
          <UseCase
            icon="🏛️"
            title={t("landing.useCases.governments.title")}
            description={t("landing.useCases.governments.description")}
            index={2}
          />
        </div>
      </section>

      {/* ARCHITECTURE SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 border-t border-slate-200 dark:border-slate-700">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-blockchain-50 to-blockchain-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-8 sm:p-12 border border-blockchain-200 dark:border-slate-700"
        >
          <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-6">
            {t("landing.architecture.title")}
          </h3>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Web2 */}
            <div className="space-y-4">
              <div className="text-3xl mb-3">🗄️</div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("landing.architecture.web2.title")}
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <li>{t("landing.architecture.web2.item1")}</li>
                <li>{t("landing.architecture.web2.item2")}</li>
                <li>{t("landing.architecture.web2.item3")}</li>
                <li>{t("landing.architecture.web2.item4")}</li>
              </ul>
            </div>

            {/* Bridge */}
            <div className="space-y-4">
              <div className="text-3xl mb-3">🌉</div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("landing.architecture.bridge.title")}
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <li>{t("landing.architecture.bridge.item1")}</li>
                <li>{t("landing.architecture.bridge.item2")}</li>
                <li>{t("landing.architecture.bridge.item3")}</li>
                <li>{t("landing.architecture.bridge.item4")}</li>
              </ul>
            </div>

            {/* Web3 */}
            <div className="space-y-4">
              <div className="text-3xl mb-3">⛓️</div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("landing.architecture.web3.title")}
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <li>{t("landing.architecture.web3.item1")}</li>
                <li>{t("landing.architecture.web3.item2")}</li>
                <li>{t("landing.architecture.web3.item3")}</li>
                <li>{t("landing.architecture.web3.item4")}</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-slate-600 dark:text-slate-400">
            <p>
              {t("appName")} - {t("appTagline")}
            </p>
            <p className="text-sm mt-2"> </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

/**
 * Feature Card Component
 */
function FeatureCard({
  icon,
  title,
  description,
  index,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="p-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blockchain-300 dark:hover:border-blockchain-600 transition"
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h4 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">
        {title}
      </h4>
      <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

/**
 * Use Case Component
 */
function UseCase({ icon, title, description, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="p-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-xl transition text-center"
    >
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
        {title}
      </h3>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

export default Landing;