import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { DemoLoginModal } from '../components/DemoLoginModal';

const TIERS = [
  {
    name: 'Academic',
    price: 'Free',
    period: 'forever',
    badge: null,
    color: 'slate',
    description: 'Perfect for small universities and student organizations getting started with blockchain voting.',
    features: [
      { text: 'Up to 500 voters', included: true },
      { text: '3 simultaneous elections', included: true },
      { text: 'Blockchain audit trail (Sepolia)', included: true },
      { text: 'Anonymous nullifier voting', included: true },
      { text: 'Public transparency page', included: true },
      { text: 'Email support', included: true },
      { text: 'Custom branding', included: false },
      { text: 'SSO / LDAP integration', included: false },
      { text: 'Advanced analytics', included: false },
      { text: 'SLA guarantee', included: false },
    ],
    cta: 'Get Started Free',
    ctaAction: 'register',
  },
  {
    name: 'Professional',
    price: '€299',
    period: '/month',
    badge: 'Most Popular',
    color: 'blue',
    description: 'For mid-size institutions that need unlimited elections, advanced analytics and dedicated support.',
    features: [
      { text: 'Up to 10,000 voters', included: true },
      { text: 'Unlimited elections', included: true },
      { text: 'Blockchain audit trail (Mainnet ready)', included: true },
      { text: 'Anonymous nullifier voting', included: true },
      { text: 'Public transparency page', included: true },
      { text: 'Priority support (< 4h response)', included: true },
      { text: 'Custom branding & domain', included: true },
      { text: 'Advanced analytics dashboard', included: true },
      { text: 'SSO / LDAP integration', included: false },
      { text: 'SLA guarantee', included: false },
    ],
    cta: 'Start Free Trial',
    ctaAction: 'register',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    badge: null,
    color: 'indigo',
    description: 'For large universities, governments and organizations requiring full control and custom SLAs.',
    features: [
      { text: 'Unlimited voters', included: true },
      { text: 'Unlimited elections', included: true },
      { text: 'Mainnet + private chain options', included: true },
      { text: 'Anonymous nullifier voting', included: true },
      { text: 'Public transparency page', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'Custom branding & white-label', included: true },
      { text: 'Full analytics & exports', included: true },
      { text: 'SSO / LDAP / SAML integration', included: true },
      { text: '99.9% SLA guarantee', included: true },
    ],
    cta: 'Contact Sales',
    ctaAction: 'contact',
  },
];

const FAQ = [
  {
    q: 'How does blockchain voting preserve anonymity?',
    a: 'Each vote generates a unique HMAC-SHA256 nullifier — a cryptographic hash derived from the voter\'s identity and the election. Only the nullifier is recorded on-chain, making it mathematically impossible to link a transaction to a specific voter, while still preventing double-voting.',
  },
  {
    q: 'What blockchain network does VTB use?',
    a: 'VTB currently runs on Ethereum Sepolia testnet for demos and development. Production deployments can target Ethereum Mainnet, Polygon, or a private EVM-compatible chain. The smart contract is fully auditable.',
  },
  {
    q: 'Can we self-host VTB?',
    a: 'Yes. VTB is open-source. Enterprise customers can self-host the backend, deploy their own smart contract, and run the frontend on their own infrastructure. We provide full deployment support.',
  },
  {
    q: 'How long does it take to set up an election?',
    a: 'Creating an election takes under 2 minutes: name, description, candidates, voter census (by email domain), and start/end dates. Voters receive access automatically — no extra registration needed.',
  },
  {
    q: 'Is the voter census stored on-chain?',
    a: 'No. Voter identity stays in your institution\'s database (Web2). Only anonymous nullifiers and vote proofs are written to the blockchain. This hybrid architecture gives you privacy compliance without sacrificing auditability.',
  },
];

function FeatureRow({ text, included }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {included ? (
        <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
      ) : (
        <span className="text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0">–</span>
      )}
      <span className={included ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
        {text}
      </span>
    </li>
  );
}

export function Pricing() {
  const navigate = useNavigate();
  const [demoOpen, setDemoOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [formState, setFormState] = useState({ name: '', institution: '', email: '', size: '', message: '' });
  const [formSent, setFormSent] = useState(false);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setFormSent(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <Navbar />
      <DemoLoginModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />

      {/* Hero */}
      <section className="pt-20 pb-16 px-4 text-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-900">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Transparent Pricing
          </span>
          <h1 className="text-5xl font-black text-slate-900 dark:text-white mb-4">
            Simple, honest pricing.<br />
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              No surprises.
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
            Start free and scale as your institution grows. Every plan includes real blockchain auditability.
          </p>
          <button
            onClick={() => setDemoOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-lg shadow-blue-600/30"
          >
            🚀 Try Live Demo — No Registration
          </button>
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map((tier, idx) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`relative rounded-3xl border-2 p-8 flex flex-col ${
                tier.badge
                  ? 'border-blue-500 dark:border-blue-400 shadow-xl shadow-blue-500/10'
                  : 'border-slate-200 dark:border-slate-700 shadow-sm'
              } bg-white dark:bg-slate-800`}
            >
              {tier.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{tier.name}</h2>
                <div className="flex items-end gap-1 mb-3">
                  <span className="text-4xl font-black text-slate-900 dark:text-white">{tier.price}</span>
                  <span className="text-slate-500 dark:text-slate-400 mb-1 text-sm">{tier.period}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{tier.description}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {tier.features.map(f => <FeatureRow key={f.text} {...f} />)}
              </ul>

              <button
                onClick={() => {
                  if (tier.ctaAction === 'contact') {
                    document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    navigate('/register-request');
                  }
                }}
                className={`w-full py-3 rounded-2xl font-semibold text-sm transition ${
                  tier.badge
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                }`}
              >
                {tier.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-10">
          Compare plans
        </h2>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">Feature</th>
                {TIERS.map(t => (
                  <th key={t.name} className="text-center px-4 py-4 text-slate-900 dark:text-white font-semibold">{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Voters', '500', '10,000', 'Unlimited'],
                ['Active elections', '3', 'Unlimited', 'Unlimited'],
                ['Blockchain network', 'Sepolia', 'Sepolia + Mainnet', 'Any EVM chain'],
                ['Anonymous voting', '✓', '✓', '✓'],
                ['Public audit page', '✓', '✓', '✓'],
                ['Custom branding', '–', '✓', '✓'],
                ['SSO integration', '–', '–', '✓'],
                ['Advanced analytics', '–', '✓', '✓'],
                ['SLA', '–', '–', '99.9%'],
                ['Support', 'Email', 'Priority', 'Dedicated'],
              ].map(([feature, ...values], i) => (
                <tr key={feature} className={`border-t border-slate-200 dark:border-slate-700 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}>
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{feature}</td>
                  {values.map((v, vi) => (
                    <td key={vi} className="text-center px-4 py-3 text-slate-600 dark:text-slate-400">
                      {v === '✓' ? <span className="text-emerald-500 font-bold">✓</span>
                       : v === '–' ? <span className="text-slate-300 dark:text-slate-600">–</span>
                       : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Try Demo CTA Banner */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 p-10 text-center text-white"
        >
          <h2 className="text-3xl font-bold mb-3">See it in action</h2>
          <p className="text-blue-100 mb-6 max-w-xl mx-auto">
            No registration. No credit card. Real blockchain voting with full audit trail in under 60 seconds.
          </p>
          <button
            onClick={() => setDemoOpen(true)}
            className="px-8 py-3 rounded-2xl bg-white text-blue-700 font-bold hover:bg-blue-50 transition shadow-lg"
          >
            🎓 Launch Demo Now
          </button>
        </motion.div>
      </section>

      {/* Register Institution Form */}
      <section id="contact-form" className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-3">
            Register your institution
          </h2>
          <p className="text-center text-slate-600 dark:text-slate-400 mb-8">
            Tell us about your organization and we'll set up a custom demo tailored to your needs.
          </p>

          {formSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-8 text-center"
            >
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                Request received!
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                We'll be in touch within 24 hours to set up your institutional demo.
              </p>
            </motion.div>
          ) : (
            <form
              onSubmit={handleFormSubmit}
              className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 space-y-5"
            >
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your name</label>
                  <input
                    required
                    type="text"
                    value={formState.name}
                    onChange={e => setFormState(p => ({ ...p, name: e.target.value }))}
                    placeholder="María García"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Institution</label>
                  <input
                    required
                    type="text"
                    value={formState.institution}
                    onChange={e => setFormState(p => ({ ...p, institution: e.target.value }))}
                    placeholder="Universidad de Madrid"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Institutional email</label>
                  <input
                    required
                    type="email"
                    value={formState.email}
                    onChange={e => setFormState(p => ({ ...p, email: e.target.value }))}
                    placeholder="you@universidad.es"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Number of users</label>
                  <select
                    value={formState.size}
                    onChange={e => setFormState(p => ({ ...p, size: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select range</option>
                    <option>1 – 500</option>
                    <option>500 – 2,000</option>
                    <option>2,000 – 10,000</option>
                    <option>10,000+</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tell us about your use case</label>
                <textarea
                  rows={3}
                  value={formState.message}
                  onChange={e => setFormState(p => ({ ...p, message: e.target.value }))}
                  placeholder="Student elections, faculty governance, budget referendums..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-lg shadow-blue-600/20"
              >
                📩 Request Institution Demo
              </button>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                We respond within 24 hours · No commitment required
              </p>
            </form>
          )}
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-10">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {FAQ.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="font-medium text-slate-900 dark:text-white text-sm pr-4">{item.q}</span>
                <span className={`text-slate-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </button>
              {openFaq === i && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="px-6 pb-5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-4"
                >
                  {item.a}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer strip */}
      <div className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-400 dark:text-slate-600">
        © 2025 VTB · Vote Through Blockchain · Universidad Francisco de Vitoria
      </div>
    </div>
  );
}

export default Pricing;
