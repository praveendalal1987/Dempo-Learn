import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Sparkles, Trophy, Zap, Bot, Flame, BookOpen, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import studentsGroupImg from "@/assets/hero-students-1.jpg";

/* ---------- Bento tile wrapper: staggered reveal + hover lift ---------- */

function Tile({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
      }}
      whileHover={reduce ? undefined : { y: -6 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Card surface ---------- */

const cardBase =
  "h-full rounded-3xl border border-white/50 dark:border-white/10 bg-white/85 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5";

/* ---------- Mock feature cards (each fills its bento cell) ---------- */

function AiChatCard() {
  return (
    <div className={`${cardBase} p-5 flex flex-col justify-center`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI Study Buddy</span>
        <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="space-y-2 text-xs">
        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[85%]">
          Explain photosynthesis like I'm 5 🌱
        </div>
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-2xl rounded-br-sm px-3 py-2 ml-auto max-w-[88%]">
          Plants eat sunlight and burp out oxygen. Fr fr. 🌞
        </div>
      </div>
    </div>
  );
}

function ProgressCard() {
  const reduce = useReducedMotion();
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = 0.72;
  return (
    <div className={`${cardBase} p-5 flex items-center gap-3`}>
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 48 48" className="w-14 h-14 -rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-slate-200 dark:stroke-slate-700" />
          <motion.circle
            cx="24" cy="24" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
            className="stroke-fuchsia-500"
            strokeDasharray={c}
            initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.4, delay: 0.6, ease: "easeOut" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100">72%</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Financial Mgmt</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Almost there 🔥</p>
      </div>
    </div>
  );
}

function XpCard() {
  return (
    <div className={`${cardBase} p-5 flex items-center`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-inner">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-none">+120 XP</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-500" /> 7-day streak
          </p>
        </div>
      </div>
    </div>
  );
}

const SUBJECT_PAIRS = [
  [
    { name: "Financial Accounting", tag: "BCom", color: "from-emerald-400 to-teal-500" },
    { name: "Marketing Management", tag: "MBA", color: "from-violet-400 to-fuchsia-500" },
  ],
  [
    { name: "Business Economics", tag: "BCom", color: "from-sky-400 to-cyan-500" },
    { name: "Corporate Finance", tag: "MBA", color: "from-amber-400 to-orange-500" },
  ],
];

function SubjectsCard() {
  const reduce = useReducedMotion();
  const [pair, setPair] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setPair((p) => (p + 1) % SUBJECT_PAIRS.length), 3500);
    return () => clearInterval(id);
  }, [reduce]);
  return (
    <div className={`${cardBase} p-5 flex flex-col justify-center`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Popular subjects</span>
      </div>
      <div className="relative h-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={pair}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="space-y-2 absolute inset-0"
          >
            {SUBJECT_PAIRS[pair].map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded-md bg-gradient-to-br ${s.color} text-white text-[10px] font-bold shrink-0`}>{s.tag}</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function LeaderboardCard() {
  const rows = [
    { rank: 1, name: "Maya", xp: "2,480", color: "from-amber-400 to-orange-500" },
    { rank: 2, name: "Jae", xp: "2,310", color: "from-violet-400 to-fuchsia-500" },
    { rank: 3, name: "You", xp: "2,090", color: "from-emerald-400 to-teal-500" },
  ];
  return (
    <div className={`${cardBase} p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Leaderboard</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.rank} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-slate-400 font-semibold">{row.rank}</span>
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${row.color} flex items-center justify-center text-white text-[10px] font-bold`}>{row.name[0]}</div>
            <span className={`flex-1 font-medium ${row.name === "You" ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-slate-700 dark:text-slate-200"}`}>{row.name}</span>
            <span className="text-slate-500 dark:text-slate-400">{row.xp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentPhotoCard() {
  const reduce = useReducedMotion();
  return (
    <div className={`${cardBase} p-2 overflow-hidden`}>
      <div className="relative w-full h-full min-h-40 rounded-2xl overflow-hidden">
        <motion.img
          src={studentsGroupImg}
          alt="Students studying together"
          className="w-full h-full object-cover"
          loading="lazy"
          animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3">
          <p className="text-sm font-semibold text-white drop-shadow">Study squads, IRL energy 📚</p>
        </div>
      </div>
    </div>
  );
}

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

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 lg:pt-36 lg:pb-28">
        {/* Copy */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
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
              href="/sign-up"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold bg-white text-fuchsia-600 rounded-full shadow-xl shadow-fuchsia-900/20 transition-transform hover:scale-[1.04]"
            >
              Get started — it's free
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="text-white/80 text-sm">Free for students · No credit card · Set up in seconds</p>
          </div>
        </motion.div>

        {/* Bento grid — deterministic, responsive, never overlaps */}
        <motion.div
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }}
          initial="hidden"
          animate="show"
          className="mt-16 grid grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(9rem,1fr)] gap-4 sm:gap-5"
        >
          <Tile className="col-span-2"><AiChatCard /></Tile>
          <Tile className="col-span-2 row-span-2"><StudentPhotoCard /></Tile>
          <Tile className="col-span-1"><ProgressCard /></Tile>
          <Tile className="col-span-1"><XpCard /></Tile>
          <Tile className="col-span-2"><LeaderboardCard /></Tile>
          <Tile className="col-span-2"><SubjectsCard /></Tile>
        </motion.div>
      </div>
    </section>
  );
}
