import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { Sparkles, ArrowRight } from "lucide-react";

/* ---------- Hero ---------- */

export function LandingHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      {/* Rich gradient + glow field */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 dark:from-violet-950 dark:via-fuchsia-900 dark:to-orange-900" />
      <div className="absolute -top-40 -left-24 w-[32rem] h-[32rem] rounded-full bg-cyan-300/40 dark:bg-cyan-500/20 blur-3xl" />
      <div className="absolute top-1/3 -right-24 w-[34rem] h-[34rem] rounded-full bg-pink-300/40 dark:bg-pink-500/20 blur-3xl" />
      {/* Subtle dot texture */}
      <div
        className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-32 pb-24 lg:pt-40 lg:pb-36 text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-medium border border-white/30">
            <Sparkles className="w-4 h-4" />
            AI-powered learning, made for you
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.03] tracking-tight mb-6 drop-shadow-sm">
            Learning hits <span className="italic font-sans font-normal">Different</span>
            <br className="hidden sm:block" /> at Dempo.
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-xl mx-auto mb-9 leading-relaxed">
            Chat with AI, stack XP, and climb the leaderboard while you crush your BCom &amp; MBA subjects. Your classes, minus the boring parts.
          </p>
          <div className="flex flex-col items-center gap-4">
            <Link
              href="/sign-in"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold bg-white text-fuchsia-600 rounded-full shadow-xl shadow-fuchsia-900/20 transition-transform hover:scale-[1.04]"
            >
              Sign in
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="text-white/80 text-sm">Access is by invitation — sign in with the email your professor added.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
