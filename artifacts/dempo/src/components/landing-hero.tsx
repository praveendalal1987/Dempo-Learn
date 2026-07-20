import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Sparkles,
  Trophy,
  Zap,
  Bot,
  Flame,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import studentsGroupImg from "@/assets/hero-students-1.jpg";
import studentLectureImg from "@/assets/hero-students-2.jpg";

/* ---------- Floating wrapper ---------- */

function Floating({
  children,
  className,
  delay = 0,
  duration = 6,
  distance = 12,
  initialY = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  distance?: number;
  initialY?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: initialY, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
    >
      <motion.div
        animate={{ y: [0, -distance, 0] }}
        transition={{
          duration,
          delay: delay + 0.7,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ---------- Mock feature cards ---------- */

const cardBase =
  "rounded-2xl border border-white/40 dark:border-white/15 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md shadow-xl shadow-black/10";

function AiChatCard() {
  return (
    <div className={`${cardBase} w-64 p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI Study Buddy</span>
      </div>
      <div className="space-y-2 text-xs">
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl rounded-bl-sm px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[85%]">
          Explain photosynthesis like I'm 5 🌱
        </div>
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl rounded-br-sm px-3 py-2 ml-auto max-w-[85%]">
          Plants eat sunlight and burp out oxygen. Fr fr. 🌞
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ className = "w-48" }: { className?: string }) {
  const reduce = useReducedMotion();
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = 0.72;
  return (
    <div className={`${cardBase} ${className} p-4 flex items-center gap-3`}>
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 48 48" className="w-14 h-14 -rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-slate-200 dark:stroke-slate-700" />
          <motion.circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-fuchsia-500"
            strokeDasharray={c}
            initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.4, delay: 0.8, ease: "easeOut" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100">
          72%
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Financial Management</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Almost there 🔥</p>
      </div>
    </div>
  );
}

function XpCard({ className = "w-44" }: { className?: string }) {
  return (
    <div className={`${cardBase} ${className} p-4 flex items-center`}>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">+120 XP</p>
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

function SubjectsCard({ className = "w-60" }: { className?: string }) {
  const reduce = useReducedMotion();
  const [pair, setPair] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setPair((p) => (p + 1) % SUBJECT_PAIRS.length), 3500);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className={`${cardBase} ${className} p-4 overflow-hidden`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
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
                <span className={`px-1.5 py-0.5 rounded-md bg-gradient-to-br ${s.color} text-white text-[10px] font-bold shrink-0`}>
                  {s.tag}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StudentPhotoCard({
  src,
  alt,
  caption,
  className = "w-64",
  imgClassName = "h-40",
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
  imgClassName?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`${cardBase} ${className} p-2 overflow-hidden`}>
      <div className={`relative w-full ${imgClassName} rounded-xl overflow-hidden`}>
        <motion.img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          animate={reduce ? undefined : { scale: [1, 1.08, 1], x: [0, -6, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2">
          <p className="text-xs font-semibold text-white drop-shadow">{caption}</p>
        </div>
      </div>
    </div>
  );
}

/* Cycles through mini learning moments — asks the AI, levels up, aces a quiz. */
const LEARNING_MOMENTS = [
  { icon: Bot, color: "from-violet-500 to-fuchsia-500", title: "Asking AI Study Buddy", sub: "\u201CBreak down cash flow statements\u201D" },
  { icon: Zap, color: "from-amber-400 to-orange-500", title: "Quiz aced — +40 XP", sub: "Marketing Management, Unit 3" },
  { icon: Trophy, color: "from-emerald-400 to-teal-500", title: "Moved up to #4", sub: "Corporate Finance leaderboard" },
];

function LearningLoopCard({ className = "w-64" }: { className?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % LEARNING_MOMENTS.length), 3000);
    return () => clearInterval(id);
  }, [reduce]);

  const m = LEARNING_MOMENTS[step];
  const Icon = m.icon;

  return (
    <div className={`${cardBase} ${className} p-4 overflow-hidden`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Learning live</span>
      </div>
      <div className="relative h-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 flex items-center gap-3"
          >
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{m.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.sub}</p>
            </div>
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
    { rank: 3, name: "Tomás", xp: "2,150", color: "from-sky-400 to-cyan-500" },
    { rank: 4, name: "You", xp: "2,090", color: "from-emerald-400 to-teal-500" },
  ];
  return (
    <div className={`${cardBase} w-52 p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Leaderboard</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.rank} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-slate-400 font-semibold">{r.rank}</span>
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${r.color} flex items-center justify-center text-white text-[10px] font-bold`}>
              {r.name[0]}
            </div>
            <span className={`flex-1 font-medium ${r.name === "You" ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-slate-700 dark:text-slate-200"}`}>
              {r.name}
            </span>
            <span className="text-slate-500 dark:text-slate-400">{r.xp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiAssistantBadge() {
  return (
    <div className={`${cardBase} px-4 py-3 flex items-center gap-2 w-fit`}>
      <div className="relative">
        <Sparkles className="w-5 h-5 text-violet-500" />
      </div>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI Assistant</span>
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

/* ---------- Hero ---------- */

export function LandingHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 dark:from-violet-900 dark:via-fuchsia-900 dark:to-orange-800" />
      {/* Soft blobs for depth */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-300/30 dark:bg-cyan-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 w-[30rem] h-[30rem] rounded-full bg-pink-300/30 dark:bg-pink-500/20 blur-3xl" />

      {/* Floating cards — desktop */}
      <div className="hidden lg:block absolute inset-0 pointer-events-none" aria-hidden="true">
        <Floating className="absolute left-[4%] top-[16%]" delay={0.2} duration={7}>
          <AiChatCard />
        </Floating>
        <Floating className="absolute left-[7%] bottom-[14%]" delay={0.5} duration={6} distance={10}>
          <LeaderboardCard />
        </Floating>
        <Floating className="absolute right-[5%] top-[14%]" delay={0.35} duration={6.5}>
          <ProgressCard />
        </Floating>
        <Floating className="absolute right-[10%] top-[44%]" delay={0.65} duration={5.5} distance={9}>
          <XpCard />
        </Floating>
        <Floating className="absolute right-[6%] bottom-[12%]" delay={0.8} duration={7.5}>
          <SubjectsCard />
        </Floating>
        <Floating className="absolute left-[18%] top-[7%]" delay={0.95} duration={6} distance={8}>
          <AiAssistantBadge />
        </Floating>
        <Floating className="absolute right-[24%] top-[10%]" delay={1.4} duration={6.5} distance={8}>
          <LearningLoopCard className="w-64" />
        </Floating>
        <Floating className="absolute left-[3%] top-[46%]" delay={1.1} duration={7} distance={8}>
          <StudentPhotoCard src={studentsGroupImg} alt="Students studying together" caption="Study squads, IRL energy 📚" className="w-60" />
        </Floating>
        <Floating className="absolute right-[22%] bottom-[8%]" delay={1.25} duration={6.5} distance={9}>
          <StudentPhotoCard src={studentLectureImg} alt="Student taking notes in a lecture" caption="Locked in for finals ✍️" className="w-52" />
        </Floating>
      </div>

      {/* Copy */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-28 pb-20 lg:py-0">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium border border-white/30">
            <Sparkles className="w-4 h-4" />
            Learning, but make it ✨ fun ✨
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.05] tracking-tight mb-6 drop-shadow-sm">
            Learning hits <span className="italic font-sans font-normal">Different</span> <br className="hidden sm:block" />
            at Dempo.
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-xl mx-auto mb-10 leading-relaxed">
            Chat with AI, stack XP, climb the leaderboard, and crush your BCom &amp; MBA subjects — from Financial Accounting to Marketing Management. Your classes, minus the boring parts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold transition-transform hover:scale-105 bg-white text-fuchsia-600 rounded-full shadow-lg"
            >
              Get started — it's free
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold transition-colors bg-white/15 text-white border border-white/40 hover:bg-white/25 rounded-full backdrop-blur-sm"
            >
              Sign in
            </Link>
          </div>
        </motion.div>

        {/* Compact cards — mobile/tablet: equal-size grid */}
        <div className="lg:hidden mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto text-left" aria-hidden="true">
          <Floating delay={0.3} duration={6} className="h-full">
            <XpCard className="w-full min-h-28" />
          </Floating>
          <Floating delay={0.45} duration={7} distance={8} className="h-full">
            <ProgressCard className="w-full min-h-28" />
          </Floating>
          <Floating delay={0.6} duration={6.5} distance={8} className="h-full">
            <SubjectsCard className="w-full min-h-28" />
          </Floating>
          <Floating delay={0.75} duration={7} distance={8} className="h-full">
            <LearningLoopCard className="w-full min-h-28" />
          </Floating>
          <Floating delay={0.9} duration={7} distance={8} className="h-full sm:col-span-2">
            <StudentPhotoCard
              src={studentsGroupImg}
              alt="Students studying together"
              caption="Study squads, IRL energy 📚"
              className="w-full"
              imgClassName="h-48"
            />
          </Floating>
        </div>
      </div>
    </section>
  );
}
