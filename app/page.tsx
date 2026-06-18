"use client";

import { SignIn, UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import logoImg from "../public/logo.png";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  HeartPulse,
  Home as HomeIcon,
  LogIn,
  Pill,
  Plus,
  RotateCw,
  Settings2,
  TestTube2,
  Timer,
  Utensils,
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  TrendingUp,
  Scale,
  Target,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getDailyActivities,
  toggleActivity,
  savePlanAction,
  updateActivityOccurrence,
  deleteActivityAction,
  getPendingCountAction,
  getUserProfileAction,
  getOnboardingAdjustmentDataAction,
  resetOnboardingAction,
  getUserRoutineAction,
  getStatisticsDataAction,
  estimateCaloriesAction,
  parseFoodInputWithAIAction,
  getActiveProjectAction,
  createProjectAction,
  deleteProjectAction,
  addProjectMeasurementAction,
  deleteProjectMeasurementAction,
  UserProfile,
  ActivityItem,
  PlanType,
  WorkoutExercise,
  DietItem,
  MedItem,
  BloodExamItem,
  PlanDetails,
  Meal,
  MealItem,
  Project,
  ProjectMeasurement,
  ProjectGoalType,
  ProjectMeasurementFrequency
} from "./actions";
import OnboardingChat from "./components/OnboardingChat";


function getLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr: string): string {
  const todayStr = getLocalDateStr(new Date());
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateStr(yesterday);
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateStr(tomorrow);

  if (dateStr === todayStr) return "Hoje";
  if (dateStr === yesterdayStr) return "Ontem";
  if (dateStr === tomorrowStr) return "Amanhã";

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const label = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatGoalLabel(goal?: string) {
  const labels: Record<string, string> = {
    bulking: "Bulking (ganho de massa magra)",
    cutting: "Cutting (emagrecimento)",
    manutencao: "Manutenção de uma vida saudável",
    hipertrofia: "Hipertrofia",
    emagrecimento: "Emagrecimento",
    saude: "Manutenção/Saúde"
  };
  return goal ? labels[goal] || goal : "";
}

const addOptions: Array<{
  type: PlanType;
  title: string;
  text: string;
  icon: React.ElementType;
}> = [
  { type: "musculacao", title: "Musculação", text: "ABCD e frequência", icon: Dumbbell },
  { type: "aerobico", title: "Cardio", text: "Tempo e intensidade", icon: Timer },
  { type: "bioimpedancia", title: "Bioimpedância", text: "Peso, gordura e massa", icon: Activity },
  { type: "sangue", title: "Exames de Sangue", text: "Sangue e recorrência", icon: TestTube2 },
  { type: "dieta", title: "Dieta", text: "Refeições e calorias", icon: Utensils }
];

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateStr(new Date()));
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDates, setPendingDates] = useState<string[]>([]);
  const [editing, setEditing] = useState<ActivityItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Estados para as novas abas de navegação
  const [activeTab, setActiveTab] = useState<"hoje" | "rotina" | "estatisticas" | "projetos">("hoje");
  const [userRoutine, setUserRoutine] = useState<any>(null);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [statisticsData, setStatisticsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Estados para Projetos
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectActionPending, startProjectTransition] = useTransition();

  // Sub-abas e seletores
  const [selectedWorkoutTab, setSelectedWorkoutTab] = useState("A");
  const [selectedStatCategory, setSelectedStatCategory] = useState<"dieta" | "treino" | "cardio" | "exames" | "bio">("dieta");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedCardio, setSelectedCardio] = useState("Geral");
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedBioMetric, setSelectedBioMetric] = useState<"weight" | "fatPct" | "muscleMass">("weight");

  const loadRoutineData = async () => {
    if (!isSignedIn || profileLoading) return;
    setRoutineLoading(true);
    try {
      const routine = await getUserRoutineAction();
      setUserRoutine(routine);
      if (routine?.workouts) {
        const keys = Object.keys(routine.workouts).sort();
        if (keys.length > 0 && !keys.includes(selectedWorkoutTab)) {
          setSelectedWorkoutTab(keys[0]);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar rotina:", err);
    } finally {
      setRoutineLoading(false);
    }
  };

  const loadStatisticsData = async () => {
    if (!isSignedIn || profileLoading) return;
    setStatsLoading(true);
    try {
      const stats = await getStatisticsDataAction();
      setStatisticsData(stats);
      
      // Auto-seleciona primeiro item disponível
      if (stats?.workouts) {
        const exercises = Object.keys(stats.workouts).sort();
        if (exercises.length > 0) {
          setSelectedExercise(prev => prev && exercises.includes(prev) ? prev : exercises[0]);
        }
      }
      if (stats?.exams) {
        const exams = Object.keys(stats.exams).sort();
        if (exams.length > 0) {
          setSelectedExam(prev => prev && exams.includes(prev) ? prev : exams[0]);
        }
      }
      if (stats?.aerobics) {
        const cardios = Object.keys(stats.aerobics).sort();
        if (cardios.length > 0) {
          setSelectedCardio(prev => prev && cardios.includes(prev) ? prev : cardios[0]);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadProjectData = async () => {
    if (!isSignedIn || profileLoading) return;
    setProjectLoading(true);
    try {
      const activeProject = await getActiveProjectAction();
      setProject(activeProject);
    } catch (err) {
      console.error("Erro ao carregar projeto:", err);
    } finally {
      setProjectLoading(false);
    }
  };

  useEffect(() => {
    if (isOnboarded) {
      if (activeTab === "rotina") {
        loadRoutineData();
      } else if (activeTab === "estatisticas") {
        loadStatisticsData();
      } else if (activeTab === "projetos") {
        loadProjectData();
      }
    }
  }, [activeTab, isOnboarded, isSignedIn]);

  // Carrega dados do perfil e estado do onboarding
  useEffect(() => {
    if (isSignedIn) {
      setProfileLoading(true);
      getUserProfileAction()
        .then((profile) => {
          setUserProfile(profile);
          if (profile && profile.isOnboarded) {
            setIsOnboarded(true);
          } else {
            setIsOnboarded(false);
          }
        })
        .catch((err) => {
          console.error("Erro ao carregar perfil:", err);
        })
        .finally(() => {
          setProfileLoading(false);
        });
    } else {
      setProfileLoading(false);
    }
  }, [isSignedIn]);

  // Carrega dados da data selecionada e contagem de pendências
  const loadData = () => {
    if (!isSignedIn || profileLoading || !isOnboarded) return;
    
    startTransition(async () => {
      try {
        const data = await getDailyActivities(selectedDate);
        setActivities(data);
        
        const pendingData = await getPendingCountAction();
        setPendingCount(pendingData.count);
        setPendingDates(pendingData.pendingDates);
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      }
    });
  };

  const handleEnterAdjustmentMode = async () => {
    startTransition(async () => {
      try {
        const adjProfile = await getOnboardingAdjustmentDataAction();
        if (adjProfile) {
          setUserProfile(adjProfile);
          setIsOnboarded(false);
        }
      } catch (err) {
        console.error("Erro ao entrar no modo de ajuste:", err);
      }
    });
  };

  const handleResetOnboarding = async () => {
    startTransition(async () => {
      try {
        await resetOnboardingAction();
        setUserProfile(null);
        setIsOnboarded(false);
      } catch (err) {
        console.error("Erro ao resetar onboarding:", err);
      }
    });
  };

  useEffect(() => {
    if (isOnboarded) {
      loadData();
    }
  }, [selectedDate, isSignedIn, isOnboarded]);


  // Calcula dias da semana ao redor da data selecionada
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const baseDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = baseDate.getUTCDay(); // 0=Dom, 1=Seg, ...
    
    // Segunda-feira como primeiro dia (1). Se for Domingo (0), recua 6 dias.
    const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const daysName = ["D", "S", "T", "Q", "Q", "S", "S"];
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      const curr = new Date(baseDate);
      curr.setUTCDate(baseDate.getUTCDate() + mondayDiff + i);
      const yStr = curr.getUTCFullYear();
      const mStr = String(curr.getUTCMonth() + 1).padStart(2, "0");
      const dStr = String(curr.getUTCDate()).padStart(2, "0");
      const fullDate = `${yStr}-${mStr}-${dStr}`;
      
      days.push({
        dayName: daysName[curr.getUTCDay()],
        dateStr: fullDate,
        dayNum: String(curr.getUTCDate()),
        hasPending: pendingDates.includes(fullDate),
      });
    }
    return days;
  }, [selectedDate, pendingDates]);

  // Avança ou recua um dia
  const navigateDay = (offset: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const baseDate = new Date(Date.UTC(y, m - 1, d));
    baseDate.setUTCDate(baseDate.getUTCDate() + offset);
    
    const yStr = baseDate.getUTCFullYear();
    const mStr = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
    const dStr = String(baseDate.getUTCDate()).padStart(2, "0");
    
    setSelectedDate(`${yStr}-${mStr}-${dStr}`);
  };

  // Dá check global na atividade
  const handleToggleCheck = async (item: ActivityItem) => {
    try {
      await toggleActivity(
        selectedDate,
        item.planId,
        item.occurrenceId,
        item.done,
        item.details,
        item.type
      );
      loadData();
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    }
  };

  // Calcula estatísticas do dia
  const stats = useMemo(() => {
    const total = activities.length;
    const completed = activities.filter((a) => a.done).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Contagem rápida de musculação e cardio concluídos hoje para o resumo
    let workoutsDone = 0;
    let cardioMin = 0;
    
    // Cálculo calórico
    let caloriesConsumed = 0;
    let workoutCaloriesBurned = 0;
    let cardioCaloriesBurned = 0;

    const tmb = userProfile?.biometrics?.tmb || (userProfile?.gender === "masculino" ? 2000 : userProfile?.gender === "feminino" ? 1600 : 1800);

    activities.forEach(a => {
      // Consumo calórico da dieta (itens comidos)
      if (a.type === "dieta") {
        if (a.details.meals) {
          a.details.meals.forEach(m => {
            m.items.forEach(item => {
              if (item.done === true) {
                caloriesConsumed += (Number(item.calories) || 0);
              }
            });
          });
        } else if (a.details.dietItems) {
          a.details.dietItems.forEach(item => {
            if (item.done === true) {
              caloriesConsumed += (Number(item.calories) || 0);
            }
          });
        }
      }
      
      // Gasto calórico com exercícios (se concluídos)
      if (a.done) {
        if (a.type === "musculacao") {
          workoutsDone++;
          workoutCaloriesBurned += 350; // valor padrão para treino de musculação
        }
        if (a.type === "aerobico" && a.details.aerobic) {
          const duration = Number(a.details.aerobic.duration) || 0;
          cardioMin += duration;
          cardioCaloriesBurned += duration * 7; // estimativa padrão de 7 kcal por minuto de cardio
        }
      }
    });

    const caloriesBurnedTotal = tmb + workoutCaloriesBurned + cardioCaloriesBurned;
    const calorieBalance = caloriesConsumed - caloriesBurnedTotal;

    return { 
      total, 
      completed, 
      pct, 
      workoutsDone, 
      cardioMin,
      tmb,
      caloriesConsumed,
      caloriesBurnedExercises: workoutCaloriesBurned + cardioCaloriesBurned,
      caloriesBurnedTotal,
      calorieBalance
    };
  }, [activities, userProfile]);

  const selectedLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

  if (!isLoaded || (isSignedIn && profileLoading)) {
    return (
      <div className="grid h-dvh place-items-center bg-coal text-zinc-300">
        <p className="text-sm font-semibold animate-pulse">Carregando Ratos de Academia...</p>
      </div>
    );
  }

  return (
    <>
      {!isSignedIn ? (
        <LoginScreen />
      ) : !isOnboarded ? (
        <OnboardingChat profile={userProfile} onComplete={() => setIsOnboarded(true)} />
      ) : (
        <main className="min-h-dvh overflow-hidden bg-coal text-zinc-50 sm:flex sm:flex-col sm:items-center sm:justify-center sm:p-6">
          <div className="subtle-grid fixed inset-0 opacity-25" />

          {/* Header Superior para Desktop */}
          <header className="hidden sm:flex items-center justify-between w-full max-w-[430px] md:max-w-5xl px-5 py-3 bg-graphite/60 border border-white/10 rounded-2xl backdrop-blur-xl mb-4 shadow-xl shrink-0 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 shrink-0">
                <Image
                  src={logoImg}
                  alt="Logo Ratos de Academia"
                  fill
                  sizes="32px"
                  className="object-contain"
                  priority
                />
              </div>
              <div>
                <h2 className="font-black text-[11px] tracking-widest text-white leading-none">
                  RATOS DE ACADEMIA
                </h2>
                <p className="text-[8px] text-acid font-bold tracking-wider mt-0.5 uppercase">
                  Painel de Treinos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-400 font-semibold">
                {user?.firstName ? `Olá, ${user.firstName}` : 'Perfil'}
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-5 w-5"
                    }
                  }}
                >
                  <UserButton.MenuItems>
                    <UserButton.Action
                      label="Resetar onboarding"
                      labelIcon={<RotateCw className="h-4 w-4" />}
                      onClick={handleResetOnboarding}
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </div>
            </div>
          </header>

          <section className="relative mx-auto flex h-dvh w-full max-w-[430px] md:max-w-5xl flex-col md:flex-row overflow-hidden bg-coal px-4 py-4 md:p-6 shadow-2xl shadow-black/50 sm:h-[800px] md:h-[750px] sm:max-h-[85dvh] sm:rounded-[2rem] sm:border sm:border-white/10 md:gap-6">
            {/* Coluna da Esquerda: Controle e Progresso */}
            <div className="flex flex-col gap-3 shrink-0 md:w-[320px] md:h-full md:justify-between">
              <div className="flex flex-col gap-3">
                {/* Header */}
                <header className="flex shrink-0 items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
                      Ratos de Academia
                    </p>
                    <h1 className="mt-1 text-2xl font-black text-white">
                      {activeTab === "hoje" ? selectedLabel : activeTab === "rotina" ? "Minha Rotina" : "Estatísticas"}
                    </h1>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeTab === "hoje" && (
                      <>
                        <button
                          onClick={() => navigateDay(-1)}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
                          aria-label="Dia anterior"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={() => navigateDay(1)}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
                          aria-label="Próximo dia"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </>
                    )}
                    <div className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] cursor-pointer">
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: "h-7 w-7"
                          }
                        }}
                      >
                        <UserButton.MenuItems>
                          <UserButton.Action
                            label="Resetar onboarding"
                            labelIcon={<RotateCw className="h-4 w-4" />}
                            onClick={handleResetOnboarding}
                          />
                        </UserButton.MenuItems>
                      </UserButton>
                    </div>
                  </div>
                </header>

                {/* Calendário Semanal Dinâmico */}
                <section className={`mt-4 shrink-0 rounded-lg border border-white/10 bg-white/[0.045] p-3 backdrop-blur-xl ${activeTab !== "hoje" ? "hidden md:block" : ""}`}>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekDays.map((day) => (
                      <button
                        key={day.dateStr}
                        onClick={() => setSelectedDate(day.dateStr)}
                        className={[
                          "relative flex h-[58px] flex-col items-center justify-center rounded-lg border text-center transition cursor-pointer",
                          selectedDate === day.dateStr
                            ? "border-acid bg-acid text-white"
                            : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/20"
                        ].join(" ")}
                      >
                        <span className="text-[11px] font-semibold">{day.dayName}</span>
                        <span className="text-base font-black">{day.dayNum}</span>
                        
                        {/* Indicadores do dia */}
                        {day.hasPending && selectedDate !== day.dateStr && (
                          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-ember" />
                        )}
                        <span
                          className={[
                            "absolute bottom-1.5 h-1 w-1 rounded-full",
                            selectedDate === day.dateStr
                              ? "bg-black"
                              : day.hasPending
                                ? "bg-ember"
                                : "bg-acid"
                          ].join(" ")}
                        />
                      </button>
                    ))}
                  </div>
                </section>

                {/* Contador de Pendências Acumuladas */}
                {pendingCount > 0 && (
                  <section className={`mt-3 shrink-0 rounded-lg border border-ember/20 bg-ember/15 px-3 py-2 flex items-center justify-between text-xs text-ember-300 ${activeTab !== "hoje" ? "hidden md:flex" : ""}`}>
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle size={15} />
                      <span>Você tem {pendingCount} verificações pendentes</span>
                    </div>
                    <button
                      onClick={() => {
                        if (pendingDates.length > 0) {
                          setSelectedDate(pendingDates[0]);
                        }
                      }}
                      className="font-black underline uppercase tracking-wider text-[10px] cursor-pointer"
                    >
                      Resolver
                    </button>
                  </section>
                )}

                {/* Painel de Progresso */}
                <section className={`mt-3 shrink-0 rounded-lg border border-acid/20 bg-acid/10 p-3 ${activeTab !== "hoje" ? "hidden md:block" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Progresso</p>
                      <p className="text-lg font-black text-white">
                        {stats.completed}/{stats.total} concluído
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <Metric label="Musculação" value={`${stats.workoutsDone}x`} />
                      <Metric label="Cardio" value={`${stats.cardioMin}m`} />
                      <Metric label="Série" value={`${30 - pendingCount}d`} />
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-black/35 overflow-hidden">
                    <div 
                      className="h-2 rounded-full bg-acid transition-all duration-300" 
                      style={{ width: `${stats.pct}%` }}
                    />
                  </div>
                </section>

                {/* Balanço Calórico */}
                <section className={`mt-3 shrink-0 rounded-lg border p-3 transition-colors duration-300 ${activeTab !== "hoje" ? "hidden md:block" : ""} ${
                  stats.calorieBalance < 0
                    ? "border-acid/20 bg-acid/5"
                    : stats.calorieBalance > 0
                      ? "border-ember/20 bg-ember/5"
                      : "border-white/10 bg-white/[0.045]"
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Balanço Calórico</p>
                      <p className={`text-lg font-black flex items-center gap-1.5 ${
                        stats.calorieBalance < 0
                          ? "text-acid"
                          : stats.calorieBalance > 0
                            ? "text-ember"
                            : "text-white"
                      }`}>
                        {stats.calorieBalance > 0 ? `+${stats.calorieBalance}` : stats.calorieBalance} kcal
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/25">
                          {stats.calorieBalance < 0
                            ? "Déficit"
                            : stats.calorieBalance > 0
                              ? "Superávit"
                              : "Equilibrado"}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase flex items-center justify-end gap-1">
                          <Utensils size={10} className="text-cyan" /> Consumo
                        </div>
                        <div className="text-xs font-black text-zinc-200">{stats.caloriesConsumed} kcal</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase flex items-center justify-end gap-1">
                          <Flame size={10} className="text-ember" /> Gasto
                        </div>
                        <div className="text-xs font-black text-zinc-200" title={`TMB: ${stats.tmb} kcal | Exercícios: ${stats.caloriesBurnedExercises} kcal`}>
                          {stats.caloriesBurnedTotal} kcal
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Detalhamento sutil do Gasto (TMB vs Exercício) */}
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-between items-center text-[10px] text-zinc-500 font-medium">
                    <span>Taxa Basal (TMB): {stats.tmb} kcal</span>
                    <span>Exercícios: {stats.caloriesBurnedExercises} kcal</span>
                  </div>
                </section>
              </div>

              {/* Navegação Inferior (Desktop) */}
              <nav className="hidden md:grid h-14 shrink-0 grid-cols-5 rounded-lg border border-white/10 bg-white/[0.055] p-1 backdrop-blur-xl">
                <NavButton active={activeTab === "hoje"} icon={HomeIcon} label="Hoje" onClick={() => { setActiveTab("hoje"); setSelectedDate(getLocalDateStr(new Date())); }} />
                <NavButton active={activeTab === "rotina"} icon={CalendarDays} label="Rotina" onClick={() => setActiveTab("rotina")} />
                <NavButton active={activeTab === "estatisticas"} icon={TrendingUp} label="Estatísticas" onClick={() => setActiveTab("estatisticas")} />
                <NavButton active={activeTab === "projetos"} icon={Target} label="Projetos" onClick={() => setActiveTab("projetos")} />
                <NavButton icon={Settings2} label="Ajustes" onClick={handleEnterAdjustmentMode} />
              </nav>
            </div>

            {/* Coluna da Direita: Atividades, Rotina ou Estatísticas */}
            <div className="flex-1 flex flex-col min-h-0 mt-3 md:mt-0 md:h-full md:justify-between">
              
              {activeTab === "hoje" && (
                <section className="min-h-0 flex-1 space-y-2 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between shrink-0">
                    <h2 className="text-sm font-bold text-white">Plano do dia</h2>
                    <button
                      onClick={() => setShowAdd(true)}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-acid px-3 text-xs font-black text-white hover:bg-opacity-95 cursor-pointer"
                    >
                      <Plus size={15} />
                      Novo Plano
                    </button>
                  </div>

                  {isPending ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs font-semibold text-zinc-400 animate-pulse">Sincronizando com o banco...</p>
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-white/5 bg-white/[0.02] rounded-lg">
                      <Dumbbell className="text-zinc-600 mb-2" size={32} />
                      <p className="text-sm font-bold text-zinc-400">Sem atividades hoje</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">Crie um novo plano recorrente para preencher seu calendário.</p>
                    </div>
                  ) : (
                    <div className="mobile-scroll flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2 pr-1">
                      {activities.map((item) => (
                        <PlanRow
                          key={item.id}
                          item={item}
                          onEdit={() => setEditing(item)}
                          onToggleCheck={() => handleToggleCheck(item)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === "rotina" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
                  {routineLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs font-semibold text-zinc-400 animate-pulse">Carregando rotina semanal...</p>
                    </div>
                  ) : !userRoutine || Object.keys(userRoutine).length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-white/5 bg-white/[0.02] rounded-lg">
                      <Activity className="text-zinc-600 mb-2" size={32} />
                      <p className="text-sm font-bold text-zinc-400">Nenhuma rotina configurada</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-[220px]">
                        Acesse a aba **Ajustes** e converse com o Ratão para montar sua dieta e rotina de ferro!
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-2 scrollbar-thin scrollbar-thumb-black/40">
                      {/* 1. PERFIL E BIOMETRIA */}
                      {(userRoutine.profile || userRoutine.biometrics) && (
                        <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Scale className="w-3.5 h-3.5 text-zinc-500" />
                            Composição e Objetivo
                          </h3>
                          <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                            {userRoutine.profile?.gender && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">Gênero</div>
                                <div className="font-semibold text-zinc-200 capitalize">{userRoutine.profile.gender}</div>
                              </div>
                            )}
                            {userRoutine.profile?.age && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">Idade</div>
                                <div className="font-semibold text-zinc-200">{userRoutine.profile.age} anos</div>
                              </div>
                            )}
                            {userRoutine.profile?.trainingTime && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg col-span-2">
                                <div className="text-zinc-500 mb-0.5">Tempo de Treino</div>
                                <div className="font-semibold text-zinc-200">{userRoutine.profile.trainingTime}</div>
                              </div>
                            )}
                            {userRoutine.profile?.goal && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg col-span-2">
                                <div className="text-zinc-500 mb-0.5">Objetivo Principal</div>
                                <div className="font-semibold text-acid">{formatGoalLabel(userRoutine.profile.goal)}</div>
                              </div>
                            )}
                            {userRoutine.biometrics?.weight && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">Peso</div>
                                <div className="font-bold text-zinc-200">{userRoutine.biometrics.weight} kg</div>
                              </div>
                            )}
                            {userRoutine.biometrics?.height && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">Altura</div>
                                <div className="font-bold text-zinc-200">{userRoutine.biometrics.height} cm</div>
                              </div>
                            )}
                            {userRoutine.biometrics?.fatPct && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">% Gordura</div>
                                <div className="font-bold text-emerald-400">{userRoutine.biometrics.fatPct}%</div>
                              </div>
                            )}
                            {userRoutine.biometrics?.muscleMass && (
                              <div className="bg-black/20 border border-white/5 p-2 rounded-lg">
                                <div className="text-zinc-500 mb-0.5">Massa Magra</div>
                                <div className="font-bold text-acid">{userRoutine.biometrics.muscleMass} kg</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 2. DIETA */}
                      {userRoutine.diet && userRoutine.diet.length > 0 && (
                        <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Utensils className="w-3.5 h-3.5 text-zinc-500" />
                            Plano Alimentar Ativo
                          </h3>
                          <div className="space-y-4">
                            {userRoutine.diet.map((meal: any, idx: number) => {
                              const isOldFormat = !meal.items;
                              const mealName = isOldFormat ? "Refeição" : meal.name;
                              const items = isOldFormat ? [meal] : meal.items;
                              
                              return (
                                <div key={idx} className="space-y-1.5">
                                  <div className="text-[10px] font-black text-amber-500 uppercase tracking-wider pl-1.5 border-l-2 border-amber-500/80">
                                    {mealName}
                                  </div>
                                  <div className="space-y-1.5">
                                    {items.map((item: any, itemIdx: number) => (
                                      <div key={itemIdx} className="bg-black/20 border border-white/5 p-2.5 rounded-lg flex justify-between items-start text-[11px]">
                                        <div className="space-y-0.5">
                                          <div className="font-bold text-zinc-200">{item.name}</div>
                                          <div className="text-zinc-500 text-[10px]">{item.amount}</div>
                                        </div>
                                        {item.calories > 0 && (
                                          <span className="text-[9px] font-bold text-amber-500 bg-amber-950/20 border border-amber-900/30 px-1.5 py-0.5 rounded">
                                            {item.calories} kcal
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 3. MUSCULAÇÃO */}
                      {userRoutine.workouts && Object.keys(userRoutine.workouts).length > 0 && (
                        <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Dumbbell className="w-3.5 h-3.5 text-zinc-500" />
                            Divisão de Treino Musculação
                          </h3>
                          <div className="flex gap-1 overflow-x-auto pb-1">
                            {Object.keys(userRoutine.workouts).sort().map((key) => (
                              <button
                                key={key}
                                onClick={() => setSelectedWorkoutTab(key)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all shrink-0 uppercase cursor-pointer ${
                                  selectedWorkoutTab === key
                                    ? "bg-acid text-black font-black"
                                    : "bg-black/40 border border-white/5 text-zinc-400"
                                }`}
                              >
                                Treino {key}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-2">
                            {userRoutine.workouts[selectedWorkoutTab]?.map((ex: any, idx: number) => (
                              <div key={idx} className="bg-black/20 border border-white/5 p-2.5 rounded-lg flex justify-between items-center text-[11px]">
                                <div className="space-y-0.5">
                                  <div className="font-bold text-zinc-200">{ex.name}</div>
                                  <div className="text-zinc-500 text-[10px]">
                                    {ex.series} séries x {ex.reps} reps
                                  </div>
                                </div>
                                <span className="text-[9px] font-bold text-acid bg-acid/10 border border-acid/20 px-2 py-0.5 rounded">
                                  {ex.load}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 4. CARDIO */}
                      {userRoutine.aerobic?.name && (
                        <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Timer className="w-3.5 h-3.5 text-zinc-500" />
                            Cardio
                          </h3>
                          <div className="bg-black/20 border border-white/5 p-2.5 rounded-lg flex items-center justify-between text-[11px]">
                            <div>
                              <div className="font-bold text-zinc-200">{userRoutine.aerobic.name}</div>
                              <div className="text-zinc-500 text-[10px]">Constante / Moderado</div>
                            </div>
                            <span className="text-[9px] font-bold text-cyan bg-cyan/10 border border-cyan/20 px-2 py-0.5 rounded">
                              {userRoutine.aerobic.duration} min
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "estatisticas" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                  {/* Seletor Horizontal de Categorias */}
                  <div className="flex gap-1 overflow-x-auto pb-1 shrink-0 scrollbar-none">
                    <button
                      onClick={() => setSelectedStatCategory("dieta")}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
                        selectedStatCategory === "dieta" ? "bg-amber-500 text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
                      }`}
                    >
                      Dieta
                    </button>
                    <button
                      onClick={() => setSelectedStatCategory("treino")}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
                        selectedStatCategory === "treino" ? "bg-acid text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
                      }`}
                    >
                      Treino
                    </button>
                    <button
                      onClick={() => setSelectedStatCategory("cardio")}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
                        selectedStatCategory === "cardio" ? "bg-cyan text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
                      }`}
                    >
                      Cardio
                    </button>
                    <button
                      onClick={() => setSelectedStatCategory("exames")}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
                        selectedStatCategory === "exames" ? "bg-rose-500 text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
                      }`}
                    >
                      Exames
                    </button>
                    <button
                      onClick={() => setSelectedStatCategory("bio")}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shrink-0 cursor-pointer ${
                        selectedStatCategory === "bio" ? "bg-emerald-500 text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
                      }`}
                    >
                      Composição
                    </button>
                  </div>

                  {statsLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs font-semibold text-zinc-400 animate-pulse">Carregando histórico de progresso...</p>
                    </div>
                  ) : !statisticsData ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-white/5 bg-white/[0.02] rounded-lg">
                      <TrendingUp className="text-zinc-600 mb-2" size={32} />
                      <p className="text-sm font-bold text-zinc-400">Sem dados históricos</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">Marque itens como concluídos na aba "Hoje" para alimentar seu progresso.</p>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-2">
                      
                      {/* SEÇÃO DIETA */}
                      {selectedStatCategory === "dieta" && (
                        <div className="space-y-3">
                          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-1">
                            <h3 className="text-xs font-black text-zinc-300">Consumo Calórico Diário</h3>
                            <p className="text-[10px] text-zinc-500">Exibe a ingestão total calórica real com base nas refeições consumidas.</p>
                          </div>
                          
                          <SimpleSVGChart 
                            data={statisticsData.diet} 
                            color="#f59e0b" // amber-500
                            yUnit=" kcal" 
                          />

                          {statisticsData.diet && statisticsData.diet.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                <div className="text-[10px] text-zinc-500">Maior Consumo</div>
                                <div className="text-base font-black text-amber-500">{Math.max(...statisticsData.diet.map((d: any) => d.value))} kcal</div>
                              </div>
                              <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                <div className="text-[10px] text-zinc-500">Média Consumida</div>
                                <div className="text-base font-black text-zinc-200">
                                  {Math.round(statisticsData.diet.reduce((acc: number, cur: any) => acc + cur.value, 0) / statisticsData.diet.length)} kcal
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SEÇÃO TREINO */}
                      {selectedStatCategory === "treino" && (
                        <div className="space-y-3">
                          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-2 shrink-0">
                            <label className="block">
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Exercício do Treino</span>
                              <select
                                value={selectedExercise}
                                onChange={(e) => setSelectedExercise(e.target.value)}
                                className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                              >
                                {Object.keys(statisticsData.workouts).length === 0 ? (
                                  <option value="">Nenhum exercício concluído</option>
                                ) : (
                                  Object.keys(statisticsData.workouts).sort().map((exName) => (
                                    <option key={exName} value={exName}>{exName}</option>
                                  ))
                                )}
                              </select>
                            </label>
                          </div>

                          {selectedExercise && statisticsData.workouts[selectedExercise] && statisticsData.workouts[selectedExercise].length > 0 ? (
                            <>
                              <SimpleSVGChart 
                                data={statisticsData.workouts[selectedExercise].map((pt: any) => ({
                                  date: pt.date,
                                  value: pt.loadVal,
                                  label: pt.loadStr
                                }))} 
                                color="#b6f348" // acid
                                yUnit=" kg" 
                              />
                              
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
                                  <div className="text-[9px] text-zinc-500">Mínima</div>
                                  <div className="text-xs font-black text-zinc-200">
                                    {Math.min(...statisticsData.workouts[selectedExercise].map((pt: any) => pt.loadVal))} kg
                                  </div>
                                </div>
                                <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
                                  <div className="text-[9px] text-zinc-500">Máxima</div>
                                  <div className="text-xs font-black text-acid">
                                    {Math.max(...statisticsData.workouts[selectedExercise].map((pt: any) => pt.loadVal))} kg
                                  </div>
                                </div>
                                <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
                                  <div className="text-[9px] text-zinc-500">Última</div>
                                  <div className="text-xs font-black text-cyan">
                                    {statisticsData.workouts[selectedExercise][statisticsData.workouts[selectedExercise].length - 1].loadStr}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="h-32 flex items-center justify-center text-xs text-zinc-600">
                              Sem dados de musculação concluídos.
                            </div>
                          )}
                        </div>
                      )}

                      {/* SEÇÃO CARDIO */}
                      {selectedStatCategory === "cardio" && (
                        <div className="space-y-3">
                          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-2 shrink-0">
                            <label className="block">
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Exercício Aeróbico</span>
                              <select
                                value={selectedCardio}
                                onChange={(e) => setSelectedCardio(e.target.value)}
                                className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-cyan"
                              >
                                {Object.keys(statisticsData.aerobics).length === 0 ? (
                                  <option value="">Nenhum cardio concluído</option>
                                ) : (
                                  Object.keys(statisticsData.aerobics).sort().map((cName) => (
                                    <option key={cName} value={cName}>{cName}</option>
                                  ))
                                )}
                              </select>
                            </label>
                          </div>

                          {selectedCardio && statisticsData.aerobics[selectedCardio] && statisticsData.aerobics[selectedCardio].length > 0 ? (
                            <>
                              <SimpleSVGChart 
                                data={statisticsData.aerobics[selectedCardio].map((pt: any) => ({
                                  date: pt.date,
                                  value: pt.duration
                                }))} 
                                color="#52d6ff" // cyan
                                yUnit=" min" 
                              />
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Tempo Acumulado</div>
                                  <div className="text-base font-black text-cyan">
                                    {statisticsData.aerobics[selectedCardio].reduce((acc: number, cur: any) => acc + cur.duration, 0)} min
                                  </div>
                                </div>
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Média por Sessão</div>
                                  <div className="text-base font-black text-zinc-200">
                                    {Math.round(statisticsData.aerobics[selectedCardio].reduce((acc: number, cur: any) => acc + cur.duration, 0) / statisticsData.aerobics[selectedCardio].length)} min
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="h-32 flex items-center justify-center text-xs text-zinc-600">
                              Sem dados de cardio concluídos.
                            </div>
                          )}
                        </div>
                      )}

                      {/* SEÇÃO EXAMES */}
                      {selectedStatCategory === "exames" && (
                        <div className="space-y-3">
                          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-2 shrink-0">
                            <label className="block">
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Métrica do Sangue</span>
                              <select
                                value={selectedExam}
                                onChange={(e) => setSelectedExam(e.target.value)}
                                className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-rose-500"
                              >
                                {Object.keys(statisticsData.exams).length === 0 ? (
                                  <option value="">Nenhum exame concluído</option>
                                ) : (
                                  Object.keys(statisticsData.exams).sort().map((exName) => (
                                    <option key={exName} value={exName}>{exName}</option>
                                  ))
                                )}
                              </select>
                            </label>
                          </div>

                          {selectedExam && statisticsData.exams[selectedExam] && statisticsData.exams[selectedExam].length > 0 ? (
                            <>
                              <SimpleSVGChart 
                                data={statisticsData.exams[selectedExam].map((pt: any) => ({
                                  date: pt.date,
                                  value: pt.valNum,
                                  label: pt.valStr
                                }))} 
                                color="#f43f5e" // rose-500
                                yUnit="" 
                              />
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Mínima / Máxima</div>
                                  <div className="text-xs font-black text-zinc-200">
                                    {Math.min(...statisticsData.exams[selectedExam].map((pt: any) => pt.valNum))} / {Math.max(...statisticsData.exams[selectedExam].map((pt: any) => pt.valNum))}
                                  </div>
                                </div>
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Último Valor</div>
                                  <div className="text-xs font-black text-rose-400">
                                    {statisticsData.exams[selectedExam][statisticsData.exams[selectedExam].length - 1].valStr}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="h-32 flex items-center justify-center text-xs text-zinc-600">
                              Sem dados de exames concluídos.
                            </div>
                          )}
                        </div>
                      )}

                      {/* SEÇÃO COMPOSIÇÃO / BIOIMPEDÂNCIA */}
                      {selectedStatCategory === "bio" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-1 bg-black/20 p-1 rounded-lg border border-white/5 shrink-0">
                            <button
                              onClick={() => setSelectedBioMetric("weight")}
                              className={`py-1 text-[10px] font-bold rounded cursor-pointer ${
                                selectedBioMetric === "weight" ? "bg-emerald-500 text-black font-black" : "text-zinc-400"
                              }`}
                            >
                              Peso
                            </button>
                            <button
                              onClick={() => setSelectedBioMetric("fatPct")}
                              className={`py-1 text-[10px] font-bold rounded cursor-pointer ${
                                selectedBioMetric === "fatPct" ? "bg-emerald-500 text-black font-black" : "text-zinc-400"
                              }`}
                            >
                              % Gordura
                            </button>
                            <button
                              onClick={() => setSelectedBioMetric("muscleMass")}
                              className={`py-1 text-[10px] font-bold rounded cursor-pointer ${
                                selectedBioMetric === "muscleMass" ? "bg-emerald-500 text-black font-black" : "text-zinc-400"
                              }`}
                            >
                              Massa Magra
                            </button>
                          </div>

                          {statisticsData.biometrics[selectedBioMetric] && statisticsData.biometrics[selectedBioMetric].length > 0 ? (
                            <>
                              <SimpleSVGChart 
                                data={statisticsData.biometrics[selectedBioMetric]} 
                                color="#10b981" // emerald-500
                                yUnit={selectedBioMetric === "fatPct" ? "%" : " kg"} 
                              />
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Mínimo / Máximo</div>
                                  <div className="text-xs font-black text-zinc-200">
                                    {Math.min(...statisticsData.biometrics[selectedBioMetric].map((d: any) => d.value))} / {Math.max(...statisticsData.biometrics[selectedBioMetric].map((d: any) => d.value))}
                                    {selectedBioMetric === "fatPct" ? "%" : " kg"}
                                  </div>
                                </div>
                                <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <div className="text-[10px] text-zinc-500">Variação Total</div>
                                  <div className="text-xs font-black text-emerald-400">
                                    {(
                                      statisticsData.biometrics[selectedBioMetric][statisticsData.biometrics[selectedBioMetric].length - 1].value -
                                      statisticsData.biometrics[selectedBioMetric][0].value
                                    ).toFixed(1)}
                                    {selectedBioMetric === "fatPct" ? "%" : " kg"}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="h-32 flex items-center justify-center text-xs text-zinc-600 text-center border border-dashed border-white/5 rounded-xl p-4">
                              Sem medições registradas de bioimpedância.
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

              {activeTab === "projetos" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                  {projectLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs font-semibold text-zinc-400 animate-pulse">Carregando dados do projeto...</p>
                    </div>
                  ) : !project ? (
                    <ProjectCreationForm 
                      onCreated={() => {
                        loadProjectData();
                      }}
                      userProfile={userProfile}
                    />
                  ) : (
                    <ProjectDashboard 
                      project={project} 
                      onUpdate={() => loadProjectData()} 
                    />
                  )}
                </div>
              )}

              {/* Navegação Inferior (Mobile) */}
              <nav className="mt-3 md:hidden grid h-14 shrink-0 grid-cols-5 rounded-lg border border-white/10 bg-white/[0.055] p-1 backdrop-blur-xl">
                <NavButton active={activeTab === "hoje"} icon={HomeIcon} label="Hoje" onClick={() => { setActiveTab("hoje"); setSelectedDate(getLocalDateStr(new Date())); }} />
                <NavButton active={activeTab === "rotina"} icon={CalendarDays} label="Rotina" onClick={() => setActiveTab("rotina")} />
                <NavButton active={activeTab === "estatisticas"} icon={TrendingUp} label="Estatísticas" onClick={() => setActiveTab("estatisticas")} />
                <NavButton active={activeTab === "projetos"} icon={Target} label="Projetos" onClick={() => setActiveTab("projetos")} />
                <NavButton icon={Settings2} label="Ajustes" onClick={handleEnterAdjustmentMode} />
              </nav>
            </div>
          </section>

          {editing ? (
            <EditSheet 
              item={editing} 
              dateStr={selectedDate} 
              onClose={() => {
                setEditing(null);
                loadData();
              }} 
            />
          ) : null}
          {showAdd ? (
            <AddSheet 
              dateStr={selectedDate}
              onClose={() => {
                setShowAdd(false);
                loadData();
              }} 
            />
          ) : null}
        </main>
      )}
    </>
  );
}

function LoginScreen() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-coal p-4 overflow-hidden md:flex-row md:p-8">
      {/* Grade de fundo lúdica */}
      <div className="subtle-grid fixed inset-0 opacity-15" />
      
      {/* Luz verde pulsante ao fundo (Glow) */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-acid/5 blur-[120px] pointer-events-none md:w-[600px] md:h-[600px] md:bg-acid/10" />
      <div className="absolute top-1/3 right-1/4 -translate-y-1/2 translate-x-1/2 w-[200px] h-[200px] rounded-full bg-emerald-950/10 blur-[100px] pointer-events-none md:w-[400px] md:h-[400px]" />

      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center justify-center gap-8 md:flex-row md:gap-16">
        
        {/* Lado Esquerdo (Desktop): Mascote "Ratão" Enorme e Texto de Boas-Vindas */}
        <div className="hidden md:flex flex-col items-center justify-center flex-1 text-center md:text-left md:items-start max-w-[500px]">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-white leading-none mb-3 whitespace-nowrap">
            Ratos de <span className="text-emerald-500">Academia</span>
          </h1>
          <p className="text-zinc-400 font-medium text-base mb-8 tracking-wide">
            Treino, Dieta, Aeróbico, Suplementação e Exames. Tudo em um só lugar para quem vive no foco.
          </p>
          
          <div className="relative w-full max-w-[450px] flex items-center justify-center hover:scale-[1.02] transition-transform duration-300">
            {/* Brilho verde de fundo para destacar o mascote transparente */}
            <div className="absolute w-[80%] h-[80%] rounded-full bg-emerald-500/5 blur-[80px] -z-10" />
            <img 
              src="/mascot.png" 
              alt="Mascote Ratos de Academia" 
              className="w-full h-auto max-h-[520px] object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.6)]"
              style={{
                transform: "scaleX(-1)",
                maskImage: "linear-gradient(to bottom, black 75%, transparent 98%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 98%)"
              }}
            />
          </div>
        </div>

        {/* Lado Direito / Centro (Mobile & Desktop): Card de Login com Clerk */}
        <div className="relative w-full max-w-[400px]">
          
          {/* Título Visível Apenas no Mobile */}
          <div className="flex flex-col items-center mb-6 text-center md:hidden">
            <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none whitespace-nowrap">
              Ratos de <span className="text-emerald-500">Academia</span>
            </h1>
            <p className="text-zinc-400 font-medium text-xs mt-1.5">O diário de treino definitivo</p>
          </div>

          <div className="relative z-10">
            <SignIn 
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: "#10b981", // Verde esmeralda (mais escuro e elegante)
                  colorBackground: "#0b0c0f", // Fundo do card
                },
                elements: {
                  card: "border border-emerald-500/20 bg-zinc-950/90 backdrop-blur-md shadow-2xl shadow-emerald-950/20 rounded-2xl",
                  headerTitle: "text-emerald-400 font-black text-2xl tracking-wider uppercase text-center",
                  headerSubtitle: "text-zinc-400 font-medium text-center",
                  socialButtonsBlockButton: "border border-zinc-800 bg-zinc-900/80 text-white hover:bg-zinc-800 transition-colors rounded-xl",
                  formButtonPrimary: "bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold py-3 rounded-xl transition-all border border-emerald-400/20 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 uppercase tracking-wider text-xs",
                  footerActionLink: "text-emerald-400 hover:text-emerald-350 font-bold",
                  formFieldInput: "bg-zinc-900/60 border border-zinc-800 focus:border-emerald-500 text-white rounded-xl focus:ring-1 focus:ring-emerald-500",
                  dividerLine: "bg-zinc-800",
                  dividerText: "text-zinc-500 font-bold text-xs uppercase",
                  formFieldLabel: "text-zinc-400 font-semibold text-xs",
                  identityPreviewText: "text-zinc-300",
                  identityPreviewEditButtonIcon: "text-emerald-400",
                }
              }}
            />
          </div>

          {/* Mascote "Ratão" no canto inferior esquerdo para mobile */}
          <div className="absolute -bottom-16 -left-16 w-52 h-52 z-20 pointer-events-none md:hidden filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]">
            <img 
              src="/mascot.png" 
              alt="Mascote Ratão" 
              className="w-full h-full object-contain"
              style={{
                transform: "scaleX(-1) scale(1.05) rotate(-6deg)",
                transformOrigin: "bottom right",
                maskImage: "linear-gradient(to bottom, black 75%, transparent 98%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 98%)"
              }}
            />
          </div>
        </div>

      </div>
    </main>
  );
}

function PlanRow({ 
  item, 
  onEdit,
  onToggleCheck
}: { 
  item: ActivityItem; 
  onEdit: () => void;
  onToggleCheck?: () => void;
}) {
  const info = useMemo(() => {
    switch (item.type) {
      case "musculacao":
        return {
          icon: Dumbbell,
          accent: "text-acid",
          desc: item.details.routine ? `Rotina ${item.details.routine}` : "Treino",
          amount: `${item.details.workouts?.[item.details.routine || ""]?.length || 0} exercícios`
        };
      case "aerobico":
        return {
          icon: Timer,
          accent: "text-cyan",
          desc: item.details.aerobic?.name || "Cardio",
          amount: `${item.details.aerobic?.duration || 0} min`
        };
      case "bioimpedancia":
        return {
          icon: Activity,
          accent: "text-ember",
          desc: "Avaliação Bioimpedância",
          amount: item.details.bio?.weight ? `${item.details.bio.weight}kg` : "Medição"
        };
      case "sangue":
        return {
          icon: TestTube2,
          accent: "text-rose-300",
          desc: "Exame de Sangue",
          amount: `${item.details.bloodExams?.length || 0} itens`
        };

      case "dieta":
        const mealsCount = item.details.meals?.length || item.details.dietItems?.length || 0;
        return {
          icon: Utensils,
          accent: "text-emerald-300",
          desc: "Plano Alimentar",
          amount: `${mealsCount} refeições`
        };
      default:
        return {
          icon: Dumbbell,
          accent: "text-acid",
          desc: "Atividade",
          amount: ""
        };
    }
  }, [item]);

  const Icon = info.icon;

  const renderStatusIndicator = () => {
    const handleButtonClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleCheck?.();
    };

    if (item.status === "done") {
      return (
        <button
          onClick={handleButtonClick}
          className="flex items-center justify-center h-10 w-10 text-emerald-400 hover:scale-105 active:scale-95 transition cursor-pointer"
          title="Marcar como pendente"
        >
          <CheckCircle2 size={22} />
        </button>
      );
    }
    if (item.status === "skipped") {
      return (
        <button
          onClick={handleButtonClick}
          className="flex items-center justify-center h-10 w-10 text-red-500/80 hover:scale-105 active:scale-95 transition cursor-pointer"
          title="Marcar como pendente"
        >
          <XCircle size={22} />
        </button>
      );
    }
    return (
      <button
        onClick={handleButtonClick}
        className="flex items-center justify-center h-10 w-10 text-zinc-600 hover:text-zinc-400 hover:scale-105 active:scale-95 transition cursor-pointer"
        title="Concluir atividade"
      >
        <Circle size={20} className="stroke-dasharray border-dashed opacity-60" />
      </button>
    );
  };

  const isSkipped = item.status === "skipped";

  return (
    <article 
      onClick={onEdit}
      className={[
        "grid min-h-0 grid-cols-[44px_minmax(0,1fr)_42px] items-center gap-3 rounded-lg border px-3 py-2 backdrop-blur-xl transition cursor-pointer select-none",
        isSkipped
          ? "border-dashed border-white/5 bg-white/[0.01] opacity-50 hover:border-white/10"
          : "border-white/10 bg-white/[0.045] hover:border-white/20"
      ].join(" ")}
    >
      <div className={["grid h-11 w-11 place-items-center rounded-lg bg-black/25 transition", info.accent].join(" ")}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <h3 className={["truncate text-sm font-bold", isSkipped ? "text-zinc-500 line-through" : "text-white"].join(" ")}>
            {item.title}
          </h3>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
            {item.tag}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-400">
          {isSkipped ? "Pulado hoje" : `${info.desc} - ${info.amount}`}
        </p>
      </div>
      {renderStatusIndicator()}
    </article>
  );
}

// SHEET DE EDIÇÃO
function EditSheet({ 
  item, 
  dateStr, 
  onClose 
}: { 
  item: ActivityItem; 
  dateStr: string; 
  onClose: () => void;
}) {
  const [details, setDetails] = useState<PlanDetails>(() => JSON.parse(JSON.stringify(item.details)));
  const [isSaving, setIsSaving] = useState(false);

  const [isUploadingBio, setIsUploadingBio] = useState(false);
  const [uploadBioError, setUploadBioError] = useState("");

  const handleBioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBio(true);
    setUploadBioError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || "Erro ao analisar bioimpedância");
      }

      const extracted = resData.data;
      const next = { ...details };
      next.bio = {
        ...next.bio,
        weight: extracted.weight !== null && extracted.weight !== undefined ? extracted.weight : next.bio?.weight,
        fatPct: extracted.fatPct !== null && extracted.fatPct !== undefined ? extracted.fatPct : next.bio?.fatPct,
        muscleMass: extracted.muscleMass !== null && extracted.muscleMass !== undefined ? extracted.muscleMass : next.bio?.muscleMass,
        done: true
      };
      setDetails(next);
    } catch (err: any) {
      setUploadBioError(err.message || "Erro ao processar imagem.");
    } finally {
      setIsUploadingBio(false);
    }
  };

  const todayStr = getLocalDateStr(new Date());
  const isFuture = dateStr > todayStr;

  // Estados para adição de novos itens
  // Dieta
  const [activeAddingMealIdx, setActiveAddingMealIdx] = useState<number | null>(null);
  const [newFoodInput, setNewFoodInput] = useState("");
  const [isAddingFood, setIsAddingFood] = useState(false);

  // Musculação
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseSeries, setNewExerciseSeries] = useState(4);
  const [newExerciseReps, setNewExerciseReps] = useState(10);
  const [newExerciseLoad, setNewExerciseLoad] = useState("");



  // Cardio
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [newCardioName, setNewCardioName] = useState("Bicicleta");
  const [newCardioDuration, setNewCardioDuration] = useState(30);

  // Exame
  const [showAddExam, setShowAddExam] = useState(false);
  const [newExamName, setNewExamName] = useState("");

  // Adicionar alimento desmembrando com IA
  const handleAddDietItemWithAI = async (mealIdx: number) => {
    if (!newFoodInput.trim()) return;
    setIsAddingFood(true);
    try {
      const parsed = await parseFoodInputWithAIAction(newFoodInput);
      const next = { ...details };
      if (next.meals) {
        const isDone = item.status === "done";
        next.meals[mealIdx].items.push({
          name: parsed.name,
          amount: parsed.amount,
          calories: parsed.calories,
          done: isDone ? true : undefined
        });
        setDetails(next);
      }
      setNewFoodInput("");
      setActiveAddingMealIdx(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar alimento");
    } finally {
      setIsAddingFood(false);
    }
  };

  // Adicionar alimento dietItems geral desmembrando com IA
  const handleAddGeneralDietItemWithAI = async () => {
    if (!newFoodInput.trim()) return;
    setIsAddingFood(true);
    try {
      const parsed = await parseFoodInputWithAIAction(newFoodInput);
      const next = { ...details };
      if (!next.dietItems) next.dietItems = [];
      const isDone = item.status === "done";
      next.dietItems.push({
        name: parsed.name,
        amount: parsed.amount,
        calories: parsed.calories,
        done: isDone ? true : undefined
      });
      setDetails(next);
      setNewFoodInput("");
      setActiveAddingMealIdx(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar alimento");
    } finally {
      setIsAddingFood(false);
    }
  };

  // Remover Item de Dieta
  const handleRemoveDietItem = (mealIdx: number, itemIdx: number) => {
    const next = { ...details };
    if (next.meals) {
      next.meals[mealIdx].items.splice(itemIdx, 1);
      setDetails(next);
    }
  };

  // Remover Exercício (Musculação)
  const handleRemoveWorkoutExercise = (idx: number) => {
    const next = { ...details };
    if (next.routine && next.workouts?.[next.routine]) {
      next.workouts[next.routine].splice(idx, 1);
      setDetails(next);
    }
  };

  // Adicionar Exercício (Musculação)
  const handleAddWorkoutExercise = () => {
    if (!newExerciseName) return;
    const next = { ...details };
    if (next.routine && next.workouts?.[next.routine]) {
      const isDone = item.status === "done";
      next.workouts[next.routine].push({
        name: newExerciseName,
        series: newExerciseSeries,
        reps: newExerciseReps,
        load: newExerciseLoad || "",
        done: isDone ? true : undefined
      });
      setDetails(next);
      // Limpa
      setNewExerciseName("");
      setNewExerciseSeries(4);
      setNewExerciseReps(10);
      setNewExerciseLoad("");
      setShowAddExercise(false);
    }
  };



  // Remover Exame
  const handleRemoveExam = (idx: number) => {
    const next = { ...details };
    if (next.bloodExams) {
      next.bloodExams.splice(idx, 1);
      setDetails(next);
    }
  };

  // Adicionar Exame
  const handleAddExam = () => {
    if (!newExamName) return;
    const next = { ...details };
    if (!next.bloodExams) next.bloodExams = [];
    const isDone = item.status === "done";
    next.bloodExams.push({
      name: newExamName,
      done: isDone ? true : undefined
    });
    setDetails(next);
    setNewExamName("");
    setShowAddExam(false);
  };

  // Remover Cardio
  const handleRemoveCardio = () => {
    const next = { ...details };
    delete next.aerobic;
    setDetails(next);
  };

  // Adicionar Cardio
  const handleAddCardio = () => {
    if (!newCardioName || !newCardioDuration) return;
    const next = { ...details };
    const isDone = item.status === "done";
    next.aerobic = {
      name: newCardioName,
      duration: newCardioDuration,
      done: isDone ? true : undefined
    };
    setDetails(next);
    setShowAddCardio(false);
  };

  const getExerciseTextClass = (done?: boolean) => {
    if (done === true) return "line-through text-zinc-500 transition-all";
    if (done === false) return "line-through text-red-500/60 transition-all";
    return "text-white transition-all";
  };

  // Alteração de campos individuais
  const handleWorkoutLoadChange = (index: number, val: string) => {
    if (isFuture) return;
    const next = { ...details };
    if (next.routine && next.workouts?.[next.routine]) {
      next.workouts[next.routine][index].load = val;
      setDetails(next);
    }
  };

  const handleAerobicDurationChange = (val: number) => {
    if (isFuture) return;
    const next = { ...details };
    if (next.aerobic) {
      next.aerobic.duration = val;
      setDetails(next);
    }
  };

  const handleBioChange = (field: "weight" | "fatPct" | "muscleMass", val: number) => {
    if (isFuture) return;
    const next = { ...details };
    if (!next.bio) next.bio = {};
    next.bio[field] = val;
    setDetails(next);
  };

  const handleBloodValueChange = (index: number, val: string) => {
    if (isFuture) return;
    const next = { ...details };
    if (next.bloodExams) {
      next.bloodExams[index].value = val;
      setDetails(next);
    }
  };

  // Salvar ocorrência mantendo o status atual e sincronizando os checks
  const handleSaveDecision = async () => {
    setIsSaving(true);
    try {
      const currentStatus = item.status;
      const nextDetails = { ...details };
      const routineLetter = nextDetails.routine;
      
      // Alinha os checks dos sub-itens de acordo com o status atual da atividade
      if (currentStatus === "done") {
        if (item.type === "musculacao" && routineLetter && nextDetails.workouts?.[routineLetter]) {
          nextDetails.workouts[routineLetter] = nextDetails.workouts[routineLetter].map(e => ({ ...e, done: true }));
        } else if (item.type === "dieta") {
          if (nextDetails.meals) {
            nextDetails.meals = nextDetails.meals.map(meal => ({
              ...meal,
              items: meal.items.map(it => ({ ...it, done: true }))
            }));
          } else if (nextDetails.dietItems) {
            nextDetails.dietItems = nextDetails.dietItems.map(it => ({ ...it, done: true }));
          }
        } else if (item.type === "aerobico" && nextDetails.aerobic) {
          nextDetails.aerobic.done = true;
        } else if (item.type === "bioimpedancia" && nextDetails.bio) {
          nextDetails.bio.done = true;
        } else if (item.type === "sangue" && nextDetails.bloodExams) {
          nextDetails.bloodExams = nextDetails.bloodExams.map(it => ({ ...it, done: true }));
        }
      } else if (currentStatus === "skipped") {
        if (item.type === "musculacao" && routineLetter && nextDetails.workouts?.[routineLetter]) {
          nextDetails.workouts[routineLetter] = nextDetails.workouts[routineLetter].map(e => ({ ...e, done: false }));
        } else if (item.type === "dieta") {
          if (nextDetails.meals) {
            nextDetails.meals = nextDetails.meals.map(meal => ({
              ...meal,
              items: meal.items.map(it => ({ ...it, done: false }))
            }));
          } else if (nextDetails.dietItems) {
            nextDetails.dietItems = nextDetails.dietItems.map(it => ({ ...it, done: false }));
          }
        } else if (item.type === "aerobico" && nextDetails.aerobic) {
          nextDetails.aerobic.done = false;
        } else if (item.type === "bioimpedancia" && nextDetails.bio) {
          nextDetails.bio.done = false;
        } else if (item.type === "sangue" && nextDetails.bloodExams) {
          nextDetails.bloodExams = nextDetails.bloodExams.map(it => ({ ...it, done: false }));
        }
      } else {
        // status is "pending", delete the "done" field to keep clean
        if (item.type === "musculacao" && routineLetter && nextDetails.workouts?.[routineLetter]) {
          nextDetails.workouts[routineLetter] = nextDetails.workouts[routineLetter].map(({ done, ...rest }) => rest);
        } else if (item.type === "dieta") {
          if (nextDetails.meals) {
            nextDetails.meals = nextDetails.meals.map(meal => ({
              ...meal,
              items: meal.items.map(({ done, ...rest }) => rest)
            }));
          } else if (nextDetails.dietItems) {
            nextDetails.dietItems = nextDetails.dietItems.map(({ done, ...rest }) => rest);
          }
        } else if (item.type === "aerobico" && nextDetails.aerobic) {
          delete nextDetails.aerobic.done;
        } else if (item.type === "bioimpedancia" && nextDetails.bio) {
          delete nextDetails.bio.done;
        } else if (item.type === "sangue" && nextDetails.bloodExams) {
          nextDetails.bloodExams = nextDetails.bloodExams.map(({ done, ...rest }) => rest);
        }
      }

      await updateActivityOccurrence(
        dateStr,
        item.planId || "",
        item.occurrenceId,
        nextDetails,
        "today",
        item.type,
        currentStatus === "pending" ? undefined : currentStatus
      );
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar alterações");
    } finally {
      setIsSaving(false);
    }
  };

  const info = useMemo(() => {
    switch (item.type) {
      case "musculacao": return { icon: Dumbbell, accent: "text-acid" };
      case "aerobico": return { icon: Timer, accent: "text-cyan" };
      case "bioimpedancia": return { icon: Activity, accent: "text-ember" };
      case "sangue": return { icon: TestTube2, accent: "text-rose-300" };
      case "medicamento": return { icon: Pill, accent: "text-violet-300" };
      case "dieta": return { icon: Utensils, accent: "text-emerald-300" };
      default: return { icon: Dumbbell, accent: "text-acid" };
    }
  }, [item.type]);

  const Icon = info.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-0 md:p-4">
      <div 
        className="w-full h-dvh md:h-auto md:max-h-[90vh] md:max-w-2xl rounded-none md:rounded-3xl border-0 md:border border-white/10 p-6 md:p-8 shadow-2xl flex flex-col overflow-hidden relative z-10"
        style={{
          backgroundImage: `
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E"),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "auto, 50px 50px, 50px 50px",
          backgroundRepeat: "repeat",
          backgroundColor: "#10141d"
        }}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] ${info.accent}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black text-white">{item.title}</h3>
              <p className="text-xs text-zinc-400">Editar execução do dia</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>


          {/* Corpo de Edição Específico */}
        <div className={["flex-1 overflow-y-auto space-y-4 pr-1 py-1 text-zinc-200", isFuture ? "pointer-events-none select-none opacity-60" : ""].join(" ")}>
          {/* Musculação */}
          {item.type === "musculacao" && details.routine && details.workouts?.[details.routine] && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-acid uppercase tracking-wider">Exercícios do Treino {details.routine}</p>
              {details.workouts[details.routine].map((ex, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate text-white">
                      {ex.name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {ex.series}x{ex.reps} reps
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={ex.load}
                      onChange={(e) => handleWorkoutLoadChange(idx, e.target.value)}
                      placeholder="kg"
                      className="w-16 h-8 text-center text-xs font-bold rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveWorkoutExercise(idx)}
                      className="h-8 w-8 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                      title="Remover exercício"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {!showAddExercise ? (
                <button
                  type="button"
                  onClick={() => setShowAddExercise(true)}
                  className="w-full h-9 rounded-lg border border-dashed border-white/10 hover:border-white/20 text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus size={14} /> Adicionar Exercício
                </button>
              ) : (
                <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-3">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase">Novo Exercício</div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-[10px] text-zinc-500 block mb-0.5">Nome do Exercício</span>
                      <input
                        type="text"
                        value={newExerciseName}
                        onChange={(e) => setNewExerciseName(e.target.value)}
                        placeholder="Ex: Leg Press 45"
                        className="w-full h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label>
                        <span className="text-[10px] text-zinc-500 block mb-0.5">Séries</span>
                        <input
                          type="number"
                          value={newExerciseSeries}
                          onChange={(e) => setNewExerciseSeries(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs text-center rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500 block mb-0.5">Reps</span>
                        <input
                          type="number"
                          value={newExerciseReps}
                          onChange={(e) => setNewExerciseReps(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs text-center rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500 block mb-0.5">Carga</span>
                        <input
                          type="text"
                          value={newExerciseLoad}
                          onChange={(e) => setNewExerciseLoad(e.target.value)}
                          placeholder="Ex: 50kg"
                          className="w-full h-8 px-2 text-xs text-center rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddExercise(false)}
                      className="px-3 h-8 text-xs font-bold rounded border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddWorkoutExercise}
                      className="px-3 h-8 text-xs font-bold rounded bg-acid text-black cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dieta */}
          {item.type === "dieta" && (details.meals || details.dietItems) && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Refeições / Alimentos</p>
              {details.meals ? (
                details.meals.map((meal, mealIdx) => (
                  <div key={mealIdx} className="space-y-2">
                    <div className="text-[10px] font-black text-amber-500 uppercase tracking-wider pl-1.5 border-l-2 border-amber-500/80">
                      {meal.name}
                    </div>
                    <div className="space-y-2 pl-2">
                      {meal.items.map((alimento, alimentoIdx) => (
                        <div key={alimentoIdx} className="flex items-center justify-between gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-white">
                              {alimento.name}
                            </p>
                            <p className="text-[11px] text-zinc-400">
                              Qtd: {alimento.amount} • <span className="text-emerald-300 font-semibold">{alimento.calories} kcal</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDietItem(mealIdx, alimentoIdx)}
                            className="h-8 w-8 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                            title="Remover alimento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {activeAddingMealIdx !== mealIdx ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAddingMealIdx(mealIdx);
                            setNewFoodInput("");
                          }}
                          className="w-full h-8 rounded-lg border border-dashed border-white/5 hover:border-white/10 text-[11px] font-bold text-zinc-500 hover:text-white flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Plus size={12} /> Adicionar item
                        </button>
                      ) : (
                        <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2 mt-1">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Novo Alimento</div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              disabled={isAddingFood}
                              value={newFoodInput}
                              onChange={(e) => setNewFoodInput(e.target.value)}
                              placeholder="Ex: 150g de frango grelhado ou 1 banana"
                              className="flex-1 h-9 px-3 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-emerald-400"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddDietItemWithAI(mealIdx);
                                }
                              }}
                            />
                            <button
                              type="button"
                              disabled={isAddingFood || !newFoodInput.trim()}
                              onClick={() => handleAddDietItemWithAI(mealIdx)}
                              className="h-9 px-4 rounded bg-emerald-400 text-black text-xs font-black hover:opacity-95 disabled:opacity-50 transition cursor-pointer flex items-center justify-center min-w-[80px]"
                            >
                              {isAddingFood ? "..." : "Adicionar"}
                            </button>
                          </div>
                          {isAddingFood && (
                            <div className="text-[9px] text-emerald-400 pl-1 animate-pulse font-medium">
                              🤖 Estimando calorias e formatando com IA...
                            </div>
                          )}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              disabled={isAddingFood}
                              onClick={() => setActiveAddingMealIdx(null)}
                              className="px-2.5 h-6 text-[10px] font-bold rounded border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {details.dietItems?.map((alimento, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate text-white">
                          {alimento.name}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Qtd: {alimento.amount} • <span className="text-emerald-300 font-semibold">{alimento.calories} kcal</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...details };
                          next.dietItems?.splice(idx, 1);
                          setDetails(next);
                        }}
                        className="h-8 w-8 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  {activeAddingMealIdx !== 999 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAddingMealIdx(999);
                        setNewFoodInput("");
                      }}
                      className="w-full h-9 rounded-lg border border-dashed border-white/10 hover:border-white/20 text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus size={14} /> Adicionar Alimento
                    </button>
                  ) : (
                    <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase">Novo Alimento</div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={isAddingFood}
                          value={newFoodInput}
                          onChange={(e) => setNewFoodInput(e.target.value)}
                          placeholder="Ex: 150g de frango grelhado ou 1 banana"
                          className="flex-1 h-9 px-3 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-emerald-400"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddGeneralDietItemWithAI();
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={isAddingFood || !newFoodInput.trim()}
                          onClick={handleAddGeneralDietItemWithAI}
                          className="h-9 px-4 rounded bg-emerald-400 text-black text-xs font-black hover:opacity-95 disabled:opacity-50 transition cursor-pointer flex items-center justify-center min-w-[80px]"
                        >
                          {isAddingFood ? "..." : "Adicionar"}
                        </button>
                      </div>
                      {isAddingFood && (
                        <div className="text-[10px] text-emerald-400 pl-1 animate-pulse font-medium">
                          🤖 Estimando calorias e formatando com IA...
                        </div>
                      )}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={isAddingFood}
                          onClick={() => setActiveAddingMealIdx(null)}
                          className="px-3 h-7 text-[10px] font-bold rounded border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cardio */}
          {item.type === "aerobico" && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-cyan uppercase tracking-wider">Atividade Aeróbica</p>
              {details.aerobic ? (
                <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{details.aerobic.name}</span>
                    <button
                      type="button"
                      onClick={handleRemoveCardio}
                      className="h-8 w-8 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                      title="Remover Cardio"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <label className="block">
                    <span className="text-xs text-zinc-400 mb-1 block">Duração (minutos)</span>
                    <input
                      type="number"
                      value={details.aerobic.duration}
                      onChange={(e) => handleAerobicDurationChange(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 text-white outline-none focus:border-cyan"
                    />
                  </label>
                </div>
              ) : (
                !showAddCardio ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCardio(true);
                      setNewCardioName("Bicicleta");
                      setNewCardioDuration(30);
                    }}
                    className="w-full h-12 rounded-xl border border-dashed border-white/10 hover:border-white/20 text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={16} /> Adicionar Cardio
                  </button>
                ) : (
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-3">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">Novo Cardio</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-zinc-500 block mb-0.5">Nome do Cardio</span>
                        <input
                          type="text"
                          value={newCardioName}
                          onChange={(e) => setNewCardioName(e.target.value)}
                          placeholder="Ex: Corrida, Bicicleta"
                          className="w-full h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-cyan"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-zinc-500 block mb-0.5">Duração (minutos)</span>
                        <input
                          type="number"
                          value={newCardioDuration}
                          onChange={(e) => setNewCardioDuration(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-cyan text-center"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddCardio(false)}
                        className="px-3 h-8 text-xs font-bold rounded border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCardio}
                        className="px-3 h-8 text-xs font-bold rounded bg-cyan text-black cursor-pointer"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}



          {/* Bioimpedância */}
          {item.type === "bioimpedancia" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-ember uppercase tracking-wider">Resultados de Bioimpedância</p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="bio-upload-file"
                    accept="image/*"
                    onChange={handleBioFileUpload}
                    className="hidden"
                    disabled={isUploadingBio}
                  />
                  <label
                    htmlFor="bio-upload-file"
                    className={`px-2.5 py-1 text-[10px] font-bold rounded border flex items-center gap-1 transition cursor-pointer ${
                      isUploadingBio
                        ? "border-ember/30 bg-ember/10 text-ember animate-pulse pointer-events-none"
                        : "border-white/10 text-zinc-400 hover:text-ember hover:bg-white/5"
                    }`}
                  >
                    <Upload size={12} />
                    {isUploadingBio ? "Analisando..." : "Analisar com IA"}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...details };
                      next.bio = {};
                      setDetails(next);
                    }}
                    className="px-2 py-1 text-[10px] font-bold rounded border border-white/10 text-zinc-400 hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                  >
                    Limpar Campos
                  </button>
                </div>
              </div>
              {uploadBioError && (
                <p className="text-[10px] text-red-400 font-bold bg-red-950/20 border border-red-900/30 p-2 rounded-lg">
                  ⚠️ {uploadBioError}
                </p>
              )}
              <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">Peso (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={details.bio?.weight || ""}
                      onChange={(e) => handleBioChange("weight", Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-ember"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">% Gordura</span>
                    <input
                      type="number"
                      step="0.1"
                      value={details.bio?.fatPct || ""}
                      onChange={(e) => handleBioChange("fatPct", Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-ember"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">Massa Musc (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={details.bio?.muscleMass || ""}
                      onChange={(e) => handleBioChange("muscleMass", Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-ember"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Exames de Sangue */}
          {item.type === "sangue" && details.bloodExams && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-rose-300 uppercase tracking-wider">Painel de Exames</p>
              {details.bloodExams.map((ex, idx) => (
                <div key={idx} className="bg-black/20 p-2.5 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold truncate text-white">
                      {ex.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExam(idx)}
                      className="h-8 w-8 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                      title="Remover exame"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <label className="block pl-1">
                    <span className="text-[10px] text-zinc-400 mb-1 block">Resultado / Valor</span>
                    <input
                      type="text"
                      value={ex.value || ""}
                      onChange={(e) => handleBloodValueChange(idx, e.target.value)}
                      placeholder="Não preenchido"
                      className="w-full h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-rose-300"
                    />
                  </label>
                </div>
              ))}

              {!showAddExam ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddExam(true);
                    setNewExamName("");
                  }}
                  className="w-full h-9 rounded-lg border border-dashed border-white/10 hover:border-white/20 text-xs font-bold text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus size={14} /> Adicionar Exame
                </button>
              ) : (
                <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-3">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase">Novo Exame</div>
                  <label className="block">
                    <span className="text-[10px] text-zinc-500 block mb-0.5">Nome do Exame</span>
                    <input
                      type="text"
                      value={newExamName}
                      onChange={(e) => setNewExamName(e.target.value)}
                      placeholder="Ex: Colesterol Total"
                      className="w-full h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-rose-300"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddExam(false)}
                      className="px-3 h-8 text-xs font-bold rounded border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddExam}
                      disabled={!newExamName}
                      className="px-3 h-8 text-xs font-bold rounded bg-rose-300 text-black cursor-pointer disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ações Inferiores */}
        <div className="mt-4 shrink-0 flex flex-col gap-2">
          {isFuture ? (
            <div className="text-center py-2.5 px-3 bg-white/[0.03] border border-white/5 rounded-xl text-xs text-zinc-400 font-medium leading-normal">
              ⚠️ Atividades futuras não podem ser marcadas como concluídas ou editadas.
            </div>
          ) : (
            <button
              disabled={isSaving}
              onClick={() => handleSaveDecision()}
              className="h-12 rounded-xl bg-acid text-sm font-black text-white hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-acid/10 transition w-full"
            >
              <Check size={18} />
              Salvar Alterações
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// SHEET DE ADICIONAR PLANO
function AddSheet({ 
  dateStr, 
  onClose 
}: { 
  dateStr: string; 
  onClose: () => void;
}) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [type, setType] = useState<PlanType | null>(null);
  
  // Dados do formulário
  const [title, setTitle] = useState("");
  const [freqType, setFreqType] = useState<"daily" | "weekdays" | "alternate" | "custom" | "rotation">("daily");
  
  // Variáveis para custom / rotation
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]); // Segunda a Sexta por padrão
  const [rotationRoutine, setRotationRoutine] = useState("A, B, C, D");
  
  // Detalhes específicos
  const [aerobicName, setAerobicName] = useState("Bicicleta");
  const [aerobicDuration, setAerobicDuration] = useState(30);
  
  const [bioWeight, setBioWeight] = useState(75);
  const [bioFat, setBioFat] = useState(15);
  const [bioMuscle, setBioMuscle] = useState(35);

  // Lists para sub-itens
  const [exercisesList, setExercisesList] = useState<{ [key: string]: Omit<WorkoutExercise, "done">[] }>({
    A: [{ name: "Supino Reto", series: 4, reps: 10, load: "25kg" }],
    B: [{ name: "Puxada Alta", series: 4, reps: 12, load: "50kg" }],
    C: [{ name: "Agachamento Livre", series: 4, reps: 8, load: "40kg" }],
    D: [{ name: "Desenvolvimento Halter", series: 4, reps: 10, load: "16kg" }]
  });
  const [activeRoutineTab, setActiveRoutineTab] = useState("A");

  const [meals, setMeals] = useState<Meal[]>([
    { name: "Café da manhã", items: [{ name: "Whey com banana", calories: 300, amount: "1 dose" }] }
  ]);

  const [examsList, setExamsList] = useState<Omit<BloodExamItem, "done">[]>([
    { name: "Hemograma" }
  ]);

  const [isSaving, setIsSaving] = useState(false);

  // Iniciar formulário após escolher o tipo
  const selectType = (selectedType: PlanType) => {
    setType(selectedType);
    setTitle(addOptions.find(o => o.type === selectedType)?.title || "");
    
    // Ajusta frequências sugeridas por tipo
    if (selectedType === "musculacao") {
      setFreqType("rotation");
    } else if (selectedType === "bioimpedancia") {
      setFreqType("custom");
      setCustomDays([1]); // Segunda-feira semanal
    } else if (selectedType === "sangue") {
      setFreqType("custom");
      setCustomDays([1]);
    } else {
      setFreqType("daily");
    }
    
    setStep("form");
  };

  // Checkbox de dias da semana
  const toggleCustomDay = (day: number) => {
    if (customDays.includes(day)) {
      setCustomDays(customDays.filter(d => d !== day));
    } else {
      setCustomDays([...customDays, day].sort());
    }
  };

  // Gerencia sub-itens (exercícios, alimentos, medicamentos, exames)
  const addExercise = () => {
    const list = exercisesList[activeRoutineTab] || [];
    setExercisesList({
      ...exercisesList,
      [activeRoutineTab]: [...list, { name: "", series: 3, reps: 10, load: "10kg" }]
    });
  };

  const removeExercise = (idx: number) => {
    const list = exercisesList[activeRoutineTab] || [];
    const updated = [...list];
    updated.splice(idx, 1);
    setExercisesList({
      ...exercisesList,
      [activeRoutineTab]: updated
    });
  };

  const updateExerciseField = (idx: number, field: keyof Omit<WorkoutExercise, "done">, val: any) => {
    const list = exercisesList[activeRoutineTab] || [];
    const updated = [...list];
    updated[idx] = { ...updated[idx], [field]: val };
    setExercisesList({
      ...exercisesList,
      [activeRoutineTab]: updated
    });
  };

  const addMeal = () => {
    setMeals([...meals, { name: "Nova Refeição", items: [] }]);
  };

  const removeMeal = (mealIdx: number) => {
    const updated = [...meals];
    updated.splice(mealIdx, 1);
    setMeals(updated);
  };

  const updateMealName = (mealIdx: number, newName: string) => {
    const updated = [...meals];
    updated[mealIdx] = { ...updated[mealIdx], name: newName };
    setMeals(updated);
  };

  const addMealItem = (mealIdx: number) => {
    const updated = [...meals];
    updated[mealIdx] = {
      ...updated[mealIdx],
      items: [...updated[mealIdx].items, { name: "", calories: 150, amount: "100g" }]
    };
    setMeals(updated);
  };

  const removeMealItem = (mealIdx: number, itemIdx: number) => {
    const updated = [...meals];
    const items = [...updated[mealIdx].items];
    items.splice(itemIdx, 1);
    updated[mealIdx] = {
      ...updated[mealIdx],
      items
    };
    setMeals(updated);
  };

  const updateMealItemField = (mealIdx: number, itemIdx: number, field: keyof MealItem, val: any) => {
    const updated = [...meals];
    const items = [...updated[mealIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: val };
    updated[mealIdx] = {
      ...updated[mealIdx],
      items
    };
    setMeals(updated);
  };



  const addExamItem = () => {
    setExamsList([...examsList, { name: "" }]);
  };

  const removeExamItem = (idx: number) => {
    const updated = [...examsList];
    updated.splice(idx, 1);
    setExamsList(updated);
  };

  // Salvar o plano no banco
  const handleSavePlan = async () => {
    if (!type) return;
    setIsSaving(true);

    try {
      const routineArr = freqType === "rotation" 
        ? rotationRoutine.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
        : [];

      // Monta objeto details
      let details: PlanDetails = {};
      if (type === "musculacao") {
        details.workouts = {};
        // Salva apenas os treinos das letras especificadas na rotina
        const keys = routineArr.length > 0 ? routineArr : ["A"];
        keys.forEach(k => {
          details.workouts![k] = exercisesList[k] || [];
        });
      } else if (type === "dieta") {
        details.meals = meals.filter(m => m.name.trim());
      } else if (type === "aerobico") {
        details.aerobic = { name: aerobicName, duration: aerobicDuration };

      } else if (type === "bioimpedancia") {
        details.bio = { weight: bioWeight, fatPct: bioFat, muscleMass: bioMuscle };
      } else if (type === "sangue") {
        details.bloodExams = examsList.filter(i => i.name.trim());
      }

      await savePlanAction({
        type,
        title: title.trim(),
        frequency: {
          type: freqType,
          daysOfWeek: freqType === "custom" ? customDays : undefined,
          rotationRoutine: freqType === "rotation" ? routineArr : undefined,
          rotationDays: freqType === "rotation" ? customDays : undefined,
        },
        startDate: dateStr,
        details,
      });

      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao cadastrar plano recorrente");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-0 md:p-4">
      <div 
        className="w-full h-dvh md:h-auto md:max-h-[90vh] md:max-w-2xl rounded-none md:rounded-3xl border-0 md:border border-white/10 p-6 md:p-8 shadow-2xl flex flex-col overflow-hidden relative z-10"
        style={{
          backgroundImage: `
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E"),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "auto, 50px 50px, 50px 50px",
          backgroundRepeat: "repeat",
          backgroundColor: "#10141d"
        }}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-white">Adicionar Plano</h3>
            <p className="text-xs text-zinc-400">Preencha e planeje seu calendário.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-white cursor-pointer"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Passo 1: Seleção de Tipo */}
        {step === "type" ? (
          <div className="grid grid-cols-2 gap-2 overflow-y-auto py-1">
            {addOptions.map((opt) => {
              const OptIcon = opt.icon;
              return (
                <button
                  key={opt.type}
                  onClick={() => selectType(opt.type)}
                  className="rounded-lg border border-white/10 bg-black/20 p-3 text-left hover:border-acid/30 hover:bg-black/40 transition group cursor-pointer"
                >
                  <OptIcon className="mb-2 text-acid group-hover:scale-110 transition-transform" size={20} />
                  <p className="text-sm font-bold text-white">{opt.title}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400 leading-normal">{opt.text}</p>
                </button>
              );
            })}
          </div>
        ) : (
          /* Passo 2: Formulário Customizado */
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
            {/* Título do plano */}
            <label className="block">
              <span className="text-xs text-zinc-400 mb-1 block">Nome do Plano / Título</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                placeholder="Ex: Musculação ABC, Dieta Hipertrofia, Cardio Diário"
              />
            </label>

            {/* Frequência / Recorrência */}
            <div className="space-y-2.5">
              <span className="text-xs text-zinc-400 block">Frequência da atividade</span>
              <div className="grid grid-cols-3 gap-1">
                {type !== "musculacao" && (
                  <>
                    <button
                      onClick={() => setFreqType("daily")}
                      className={`h-9 rounded-md text-xs font-bold border cursor-pointer ${freqType === "daily" ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-300"}`}
                    >
                      Todo dia
                    </button>
                    <button
                      onClick={() => setFreqType("weekdays")}
                      className={`h-9 rounded-md text-xs font-bold border cursor-pointer ${freqType === "weekdays" ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-300"}`}
                    >
                      Dias úteis
                    </button>
                    <button
                      onClick={() => setFreqType("alternate")}
                      className={`h-9 rounded-md text-xs font-bold border cursor-pointer ${freqType === "alternate" ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-300"}`}
                    >
                      Dia sim/não
                    </button>
                  </>
                )}
                {type === "musculacao" && (
                  <button
                    onClick={() => setFreqType("rotation")}
                    className={`h-9 rounded-md text-xs font-bold border cursor-pointer ${freqType === "rotation" ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-300"} col-span-3`}
                  >
                    Rotação de Treinos (Ex: ABC, ABCD)
                  </button>
                )}
                <button
                  onClick={() => setFreqType("custom")}
                  className={`h-9 rounded-md text-xs font-bold border cursor-pointer ${freqType === "custom" ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-300"} col-span-3`}
                >
                  Personalizado (Escolher dias da semana)
                </button>
              </div>

              {/* Se Rotação (Musculação) */}
              {freqType === "rotation" && (
                <div className="space-y-3 bg-black/20 p-3 rounded-lg border border-white/5">
                  <label className="block">
                    <span className="text-[11px] text-zinc-400 mb-1 block">Rotinas (separadas por vírgula)</span>
                    <input
                      type="text"
                      value={rotationRoutine}
                      onChange={(e) => setRotationRoutine(e.target.value)}
                      placeholder="A, B, C, D"
                      className="w-full h-8 px-2.5 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid font-bold"
                    />
                  </label>
                  <div>
                    <span className="text-[11px] text-zinc-400 mb-1 block">Treinar em quais dias da semana?</span>
                    <div className="flex justify-between gap-1 mt-1">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map((name, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleCustomDay(idx)}
                          className={`h-7 w-7 text-[10px] font-bold rounded-full border cursor-pointer ${
                            customDays.includes(idx) ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-400"
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Se Personalizado (custom) */}
              {freqType === "custom" && (
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                  <span className="text-[11px] text-zinc-400 mb-1 block">Dias da semana ativos</span>
                  <div className="flex justify-between gap-1 mt-1">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((name, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleCustomDay(idx)}
                        className={`h-8 w-8 text-[11px] font-bold rounded-full border cursor-pointer ${
                          customDays.includes(idx) ? "border-acid bg-acid text-white" : "border-white/10 text-zinc-400"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Configuração de detalhes com base no tipo */}

            {/* Musculação */}
            {type === "musculacao" && (
              <div className="space-y-3">
                <span className="text-xs text-zinc-400 block">Adicionar Exercícios</span>
                
                {/* Tabs de treino baseadas nas letras da rotação */}
                <div className="flex gap-1 overflow-x-auto pb-1 border-b border-white/10 shrink-0">
                  {rotationRoutine.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).map(letter => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => {
                        setActiveRoutineTab(letter);
                        if (!exercisesList[letter]) {
                          setExercisesList({ ...exercisesList, [letter]: [] });
                        }
                      }}
                      className={`h-7 px-3 text-xs font-bold rounded cursor-pointer ${activeRoutineTab === letter ? "bg-acid text-white font-black" : "bg-white/5 text-zinc-400"}`}
                    >
                      Treino {letter}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {(exercisesList[activeRoutineTab] || []).map((ex, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center bg-black/25 p-2 rounded-lg border border-white/5">
                      <input
                        type="text"
                        value={ex.name}
                        onChange={(e) => updateExerciseField(idx, "name", e.target.value)}
                        placeholder="Nome do exercício"
                        className="flex-1 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="number"
                        value={ex.series}
                        onChange={(e) => updateExerciseField(idx, "series", Number(e.target.value))}
                        placeholder="Séries"
                        title="Séries"
                        className="w-10 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="number"
                        value={ex.reps}
                        onChange={(e) => updateExerciseField(idx, "reps", Number(e.target.value))}
                        placeholder="Reps"
                        title="Repetições"
                        className="w-10 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="text"
                        value={ex.load}
                        onChange={(e) => updateExerciseField(idx, "load", e.target.value)}
                        placeholder="kg"
                        className="w-14 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <button
                        type="button"
                        onClick={() => removeExercise(idx)}
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addExercise}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10 cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Exercício ao Treino {activeRoutineTab}
                  </button>
                </div>
              </div>
            )}

            {/* Dieta */}
            {type === "dieta" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400 font-bold block">Refeições da Dieta</span>
                  <button
                    type="button"
                    onClick={addMeal}
                    className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded bg-acid text-black hover:opacity-90 cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={12} /> Nova Refeição
                  </button>
                </div>
                
                <div className="space-y-4">
                  {meals.map((meal, mealIdx) => (
                    <div key={mealIdx} className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3">
                      <div className="flex gap-2 items-center justify-between">
                        <input
                          type="text"
                          value={meal.name}
                          onChange={(e) => updateMealName(mealIdx, e.target.value)}
                          placeholder="Nome da Refeição (ex: Almoço)"
                          className="flex-1 h-8 px-2 text-xs font-black rounded bg-black/40 border border-white/10 text-emerald-400 outline-none focus:border-acid"
                        />
                        <button
                          type="button"
                          onClick={() => removeMeal(mealIdx)}
                          className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20 cursor-pointer"
                          title="Remover refeição inteira"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="space-y-2 pl-2 border-l border-white/5">
                        {meal.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex gap-1.5 items-center bg-black/25 p-1.5 rounded-lg border border-white/5">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateMealItemField(mealIdx, itemIdx, "name", e.target.value)}
                              placeholder="Alimento (ex: Frango)"
                              className="flex-1 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                            />
                            <input
                              type="text"
                              value={item.amount}
                              onChange={(e) => updateMealItemField(mealIdx, itemIdx, "amount", e.target.value)}
                              placeholder="Qtd (ex: 150g)"
                              className="w-20 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                            />
                            <input
                              type="number"
                              value={item.calories}
                              onChange={(e) => updateMealItemField(mealIdx, itemIdx, "calories", Number(e.target.value))}
                              placeholder="kcal"
                              className="w-16 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                            />
                            <button
                              type="button"
                              onClick={() => removeMealItem(mealIdx, itemIdx)}
                              className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        
                        <button
                          type="button"
                          onClick={() => addMealItem(mealIdx)}
                          className="w-full h-8 rounded border border-dashed border-emerald-500/20 text-emerald-400 bg-emerald-500/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-500/10 cursor-pointer"
                        >
                          <Plus size={13} /> Adicionar Alimento a esta Refeição
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {meals.length === 0 && (
                    <div className="text-center p-6 bg-black/10 rounded-xl border border-dashed border-white/5 text-xs text-zinc-500">
                      Nenhuma refeição adicionada. Clique em "Nova Refeição" acima para começar.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cardio */}
            {type === "aerobico" && (
              <div className="space-y-3 bg-black/20 p-3 rounded-lg border border-white/5">
                <label className="block">
                  <span className="text-xs text-zinc-400 mb-1 block">Nome do Cardio</span>
                  <input
                    type="text"
                    value={aerobicName}
                    onChange={(e) => setAerobicName(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                    placeholder="Bicicleta, Corrida, Elíptico..."
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 mb-1 block">Duração Estimada (minutos)</span>
                  <input
                    type="number"
                    value={aerobicDuration}
                    onChange={(e) => setAerobicDuration(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                  />
                </label>
              </div>
            )}



            {/* Bioimpedância */}
            {type === "bioimpedancia" && (
              <div className="space-y-3 bg-black/20 p-3 rounded-lg border border-white/5">
                <span className="text-xs text-zinc-400 block mb-1">Metas Iniciais / Referências</span>
                <div className="grid grid-cols-3 gap-2">
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">Peso (kg)</span>
                    <input
                      type="number"
                      value={bioWeight}
                      onChange={(e) => setBioWeight(Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">% Gordura</span>
                    <input
                      type="number"
                      value={bioFat}
                      onChange={(e) => setBioFat(Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400 mb-1 block">Massa Musc (kg)</span>
                    <input
                      type="number"
                      value={bioMuscle}
                      onChange={(e) => setBioMuscle(Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Exames de Sangue */}
            {type === "sangue" && (
              <div className="space-y-3">
                <span className="text-xs text-zinc-400 block">Exames Planejados</span>
                <div className="space-y-2">
                  {examsList.map((exam, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center bg-black/25 p-2 rounded-lg border border-white/5">
                      <input
                        type="text"
                        value={exam.name}
                        onChange={(e) => {
                          const updated = [...examsList];
                          updated[idx].name = e.target.value;
                          setExamsList(updated);
                        }}
                        placeholder="Hemograma, Testosterona, Perfil Lipídico..."
                        className="flex-1 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <button
                        type="button"
                        onClick={() => removeExamItem(idx)}
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExamItem}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10 cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Exame
                  </button>
                </div>
              </div>
            )}

            {/* Ações Inferiores */}
            <div className="mt-4 grid grid-cols-2 gap-2 shrink-0">
              <button
                disabled={isSaving}
                onClick={() => setStep("type")}
                className="h-10 rounded-lg border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50 cursor-pointer"
              >
                Voltar
              </button>
              <button
                disabled={isSaving}
                onClick={handleSavePlan}
                className="h-10 rounded-lg bg-acid text-xs font-black text-white hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                Salvar Regra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-black text-white">{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active?: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer",
        active ? "bg-acid text-white font-black" : "text-zinc-500 hover:text-zinc-400"
      ].join(" ")}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function LoginStat({
  icon: Icon,
  label,
  value
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <Icon className="mb-2 text-acid" size={18} />
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="text-sm font-black text-white">{value}</p>
    </div>
  );
}

function formatFrequencyLabel(freq: any): string {
  if (!freq) return "Diário";
  if (freq.type === "daily") return "Diário";
  if (freq.type === "weekdays") return "Dias de semana";
  if (freq.type === "alternate") return "Dias alternados";
  if (freq.type === "custom" && freq.daysOfWeek) {
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return `Semanal (${freq.daysOfWeek.map((d: number) => dayNames[d]).join(", ")})`;
  }
  return "Personalizado";
}

function SimpleSVGChart({
  data,
  color = "#b6f348", // acid
  yUnit = ""
}: {
  data: Array<{ date: string; value: number; label?: string }>;
  color?: string;
  yUnit?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl text-zinc-600 text-[11px] bg-black/15 p-4 text-center">
        <TrendingUp className="w-6 h-6 mb-1.5 text-zinc-700 animate-pulse" />
        Nenhum registro de conclusão de plano para exibir.
      </div>
    );
  }

  // Se houver apenas 1 ponto, vamos duplicá-lo para desenhar uma linha horizontal
  const chartData = data.length === 1 
    ? [{ ...data[0], date: "" }, data[0]] 
    : data;

  const width = 500;
  const height = 220;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const yValues = chartData.map(d => d.value);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  
  const yRange = maxY - minY;
  const yMinBound = yRange === 0 ? Math.max(0, minY - 10) : Math.max(0, minY - yRange * 0.15);
  const yMaxBound = yRange === 0 ? maxY + 10 : maxY + yRange * 0.15;
  const ySpan = yMaxBound - yMinBound;

  const points = chartData.map((d, i) => {
    const x = paddingLeft + (i / (chartData.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((d.value - yMinBound) / (ySpan || 1)) * chartHeight;
    return { x, y, value: d.value, date: d.date, label: d.label };
  });

  let linePath = "";
  let areaPath = "";

  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  const gridLines = [];
  const gridCount = 4;
  for (let i = 0; i < gridCount; i++) {
    const yVal = yMinBound + (i / (gridCount - 1)) * ySpan;
    const yPos = paddingTop + chartHeight - (i / (gridCount - 1)) * chartHeight;
    gridLines.push({ value: yVal, y: yPos });
  }

  const formatChartDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  return (
    <div className="w-full bg-black/25 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 relative">
      <div className="relative w-full h-[180px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade Horizontais */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={width - paddingRight}
                y2={line.y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 8}
                y={line.y + 3}
                textAnchor="end"
                className="text-[9px] font-bold fill-zinc-500"
              >
                {Math.round(line.value)}
                {yUnit}
              </text>
            </g>
          ))}

          {/* Área preenchida */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#chartGradient)"
            />
          )}

          {/* Linha do gráfico */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Pontos nos dados */}
          {points.map((p, idx) => {
            if (!p.date) return null;
            return (
              <g key={idx} className="group/point">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4.5"
                  fill="#07090d"
                  stroke={color}
                  strokeWidth="2.5"
                  className="transition-all duration-200 cursor-pointer hover:r-[6px]"
                />
                <title>{`${p.label || p.value}${yUnit} em ${formatChartDate(p.date)}`}</title>
              </g>
            );
          })}

          {/* Rótulos do Eixo X */}
          {points.map((p, idx) => {
            const step = Math.ceil(points.length / 5);
            if (idx % step !== 0 && idx !== points.length - 1) return null;
            if (!p.date) return null;

            return (
              <text
                key={idx}
                x={p.x}
                y={height - 6}
                textAnchor="middle"
                className="text-[9px] font-bold fill-zinc-500"
              >
                {formatChartDate(p.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ProjectProgressChart({
  project,
  metricKey = "weight"
}: {
  project: Project;
  metricKey: "weight" | "fatPct" | "muscleMass";
}) {
  const width = 500;
  const height = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Datas
  const startDateStr = project.startDate;
  const endDateStr = project.endDate;
  const totalDays = project.durationDays;

  // Valores Iniciais e Alvos
  const valInicial = project.initialMetrics[metricKey] || 0;
  const valAlvo = project.targetMetrics[metricKey] || 0;

  if (valInicial === 0 && valAlvo === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl text-zinc-600 text-[11px] bg-black/15 p-4 text-center">
        Métrica indisponível neste projeto.
      </div>
    );
  }

  // Gera pontos da curva ideal projetada
  const idealPoints: Array<{ x: number; y: number; date: string; value: number }> = [];
  
  // Frequência de medição determina o intervalo dos pontos ideais no gráfico
  let stepDays = 7; // Padrão semanal
  if (project.measurementFrequency === "daily") stepDays = 1;
  else if (project.measurementFrequency === "fortnightly") stepDays = 15;
  else if (project.measurementFrequency === "monthly") stepDays = 30;

  // Função auxiliar para calcular diferença em dias
  const getDaysBetween = (d1: string, d2: string) => {
    const t1 = new Date(d1 + "T00:00:00").getTime();
    const t2 = new Date(d2 + "T00:00:00").getTime();
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  };

  // Função auxiliar para obter data formatada DD/MM
  const formatChartDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  // Pontos Reais
  const realMeasurements = project.measurements || [];
  const realPointsData = realMeasurements
    .filter(m => m[metricKey] !== undefined)
    .map(m => ({
      date: m.date,
      value: Number(m[metricKey])
    }));

  // Encontra limites mínimo e máximo para o eixo Y
  const allValues = [
    valInicial,
    valAlvo,
    ...realPointsData.map(p => p.value)
  ];
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const yRange = maxY - minY;
  const yMinBound = yRange === 0 ? Math.max(0, minY - 5) : Math.max(0, minY - yRange * 0.15);
  const yMaxBound = yRange === 0 ? maxY + 5 : maxY + yRange * 0.15;
  const ySpan = yMaxBound - yMinBound;

  // Mapeamento de coordenadas X para um dia t
  const getXCoord = (dateStr: string) => {
    const daysFromStart = getDaysBetween(startDateStr, dateStr);
    const pct = Math.max(0, Math.min(1, daysFromStart / totalDays));
    return paddingLeft + pct * chartWidth;
  };

  // Mapeamento de coordenadas Y para um valor v
  const getYCoord = (val: number) => {
    return paddingTop + chartHeight - ((val - yMinBound) / (ySpan || 1)) * chartHeight;
  };

  // Gerar pontos ideais ao longo do tempo de forma linear
  for (let i = 0; i <= totalDays; i += stepDays) {
    const pct = i / totalDays;
    const val = valInicial + pct * (valAlvo - valInicial);
    
    // Calcula a data para o dia i
    const dObj = new Date(startDateStr + "T00:00:00");
    dObj.setDate(dObj.getDate() + i);
    const dateS = getLocalDateStr(dObj);

    idealPoints.push({
      x: paddingLeft + pct * chartWidth,
      y: getYCoord(val),
      date: dateS,
      value: val
    });
  }

  // Garante que o último dia esteja incluso na curva ideal
  if (getDaysBetween(startDateStr, idealPoints[idealPoints.length - 1].date) < totalDays) {
    const dObj = new Date(startDateStr + "T00:00:00");
    dObj.setDate(dObj.getDate() + totalDays);
    const dateS = getLocalDateStr(dObj);
    idealPoints.push({
      x: paddingLeft + chartWidth,
      y: getYCoord(valAlvo),
      date: dateS,
      value: valAlvo
    });
  }

  // Desenhar caminho Ideal
  let idealPath = "";
  if (idealPoints.length > 0) {
    idealPath = `M ${idealPoints[0].x} ${idealPoints[0].y} ` + idealPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
  }

  // Mapear pontos reais
  const realPoints = realPointsData.map(pt => ({
    x: getXCoord(pt.date),
    y: getYCoord(pt.value),
    date: pt.date,
    value: pt.value
  }));

  // Ordena os pontos reais por data/coordenada X
  realPoints.sort((a, b) => a.x - b.x);

  // Desenhar caminho Real
  let realLinePath = "";
  let realAreaPath = "";
  if (realPoints.length > 0) {
    realLinePath = `M ${realPoints[0].x} ${realPoints[0].y} ` + realPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    realAreaPath = `${realLinePath} L ${realPoints[realPoints.length - 1].x} ${paddingTop + chartHeight} L ${realPoints[0].x} ${paddingTop + chartHeight} Z`;
  }

  // Cores dinâmicas por métrica
  let color = "#b6f348"; // acid
  let metricLabel = "Peso";
  let yUnit = " kg";

  if (metricKey === "fatPct") {
    color = "#f59e0b"; // laranja/amber
    metricLabel = "Gordura";
    yUnit = " %";
  } else if (metricKey === "muscleMass") {
    color = "#52d6ff"; // cyan
    metricLabel = "Massa Magra";
    yUnit = " kg";
  }

  // Linhas de Grade Y
  const gridLines = [];
  const gridCount = 4;
  for (let i = 0; i < gridCount; i++) {
    const yVal = yMinBound + (i / (gridCount - 1)) * ySpan;
    const yPos = paddingTop + chartHeight - (i / (gridCount - 1)) * chartHeight;
    gridLines.push({ value: yVal, y: yPos });
  }

  // Gerar rótulos do eixo X (Início, Meio, Fim)
  const xLabels = [
    { x: paddingLeft, date: startDateStr, label: "Início" },
    { x: paddingLeft + chartWidth / 2, date: addDays(startDateStr, Math.round(totalDays / 2)), label: "Metade" },
    { x: paddingLeft + chartWidth, date: endDateStr, label: "Meta" }
  ];

  return (
    <div className="w-full bg-black/25 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 relative">
      <div className="flex justify-between items-center text-xs shrink-0">
        <span className="font-black text-zinc-300 uppercase tracking-wider">{metricLabel}</span>
        <div className="flex gap-3 text-[10px] text-zinc-500 font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-zinc-600 border border-dashed border-zinc-400 inline-block"></span>
            <span>Ideal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2 rounded-full inline-block" style={{ backgroundColor: color }}></span>
            <span>Real</span>
          </div>
        </div>
      </div>
      
      <div className="relative w-full h-[180px] mt-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="projectChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade Horizontais */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={width - paddingRight}
                y2={line.y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 8}
                y={line.y + 3}
                textAnchor="end"
                className="text-[9px] font-bold fill-zinc-500"
              >
                {line.value.toFixed(1)}
                {yUnit}
              </text>
            </g>
          ))}

          {/* Área preenchida Real */}
          {realAreaPath && (
            <path
              d={realAreaPath}
              fill="url(#projectChartGradient)"
            />
          )}

          {/* Linha do progresso Ideal */}
          {idealPath && (
            <path
              d={idealPath}
              fill="none"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
          )}

          {/* Linha do progresso Real */}
          {realLinePath && (
            <path
              d={realLinePath}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Pontos da curva Real */}
          {realPoints.map((p, idx) => (
            <g key={idx} className="group/point">
              <circle
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill="#07090d"
                stroke={color}
                strokeWidth="2.5"
                className="transition-all duration-200 cursor-pointer hover:r-[6px]"
              />
              <title>{`${p.value}${yUnit} em ${formatChartDate(p.date)}`}</title>
            </g>
          ))}

          {/* Rótulos do Eixo X */}
          {xLabels.map((lbl, idx) => (
            <g key={idx}>
              <line
                x1={lbl.x}
                y1={paddingTop + chartHeight}
                x2={lbl.x}
                y2={paddingTop + chartHeight + 4}
                stroke="rgba(255, 255, 255, 0.1)"
              />
              <text
                x={lbl.x}
                y={height - 6}
                textAnchor="middle"
                className="text-[9px] font-bold fill-zinc-500"
              >
                {`${lbl.label} (${formatChartDate(lbl.date)})`}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function addDays(d: string, days: number): string {
  const date = new Date(d + "T00:00:00");
  date.setDate(date.getDate() + days);
  return getLocalDateStr(date);
}

function ProjectCreationForm({
  onCreated,
  userProfile
}: {
  onCreated: () => void;
  userProfile: any;
}) {
  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState<ProjectGoalType>("emagrecimento");
  const [durationDays, setDurationDays] = useState(90);
  const [metricType, setMetricType] = useState<"weight" | "composition">("weight");
  const [frequency, setFrequency] = useState<ProjectMeasurementFrequency>("weekly");

  // Métricas Iniciais (sugerir do perfil)
  const [initWeight, setInitWeight] = useState(userProfile?.biometrics?.weight?.toString() || "");
  const [initFat, setInitFat] = useState(userProfile?.biometrics?.fatPct?.toString() || "");
  const [initMuscle, setInitMuscle] = useState(userProfile?.biometrics?.muscleMass?.toString() || "");

  // Métricas Alvo
  const [targetWeight, setTargetWeight] = useState("");
  const [targetFat, setTargetFat] = useState("");
  const [targetMuscle, setTargetMuscle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Por favor, dê um título ao seu projeto.");
      return;
    }

    const initialW = parseFloat(initWeight);
    const targetW = parseFloat(targetWeight);

    if (isNaN(initialW) || initialW <= 0) {
      setError("Por favor, insira um peso inicial válido.");
      return;
    }
    if (isNaN(targetW) || targetW <= 0) {
      setError("Por favor, insira um peso alvo válido.");
      return;
    }

    setLoading(true);
    try {
      const initialMetrics = {
        weight: initialW,
        fatPct: metricType === "composition" && initFat ? parseFloat(initFat) : undefined,
        muscleMass: metricType === "composition" && initMuscle ? parseFloat(initMuscle) : undefined
      };

      const targetMetrics = {
        weight: targetW,
        fatPct: metricType === "composition" && targetFat ? parseFloat(targetFat) : undefined,
        muscleMass: metricType === "composition" && targetMuscle ? parseFloat(targetMuscle) : undefined
      };

      await createProjectAction({
        title,
        goalType,
        durationDays: Number(durationDays),
        measurementFrequency: frequency,
        metricType,
        initialMetrics,
        targetMetrics
      });

      onCreated();
    } catch (err: any) {
      setError(err.message || "Erro ao criar projeto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 pb-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl mb-4 text-center">
        <Target className="w-10 h-10 text-acid mx-auto mb-2" />
        <h3 className="text-sm font-black text-white">Crie o seu Projeto de Objetivos</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Defina uma meta física, selecione a frequência de medição e visualize sua jornada com projeções ideais.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs p-3 rounded-lg font-bold">
            {error}
          </div>
        )}

        <div className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3">
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">Título do Projeto</span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Projeto Verão Trincado, Definição 90 dias"
              className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">Objetivo</span>
              <select
                value={goalType}
                onChange={(e: any) => setGoalType(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              >
                <option value="emagrecimento">Emagrecimento</option>
                <option value="ganho_massa">Ganho de Massa</option>
                <option value="manutencao">Definição / Manutenção</option>
                <option value="outros">Outros</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">Duração (Dias)</span>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              >
                <option value={30}>30 Dias (1 Mês)</option>
                <option value={60}>60 Dias (2 Meses)</option>
                <option value={90}>90 Dias (3 Meses)</option>
                <option value={120}>120 Dias (4 Meses)</option>
                <option value={180}>180 Dias (6 Meses)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">Foco de Acompanhamento</span>
              <select
                value={metricType}
                onChange={(e: any) => setMetricType(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              >
                <option value="weight">Apenas Peso (kg)</option>
                <option value="composition">Composição Corporal</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">Frequência de Medição</span>
              <select
                value={frequency}
                onChange={(e: any) => setFrequency(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              >
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="fortnightly">A cada 15 dias</option>
                <option value="monthly">A cada mês</option>
              </select>
            </label>
          </div>
        </div>

        {/* Métricas Iniciais vs. Alvo */}
        <div className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-4">
          <h4 className="text-[10px] text-zinc-400 uppercase tracking-wider font-black border-b border-white/5 pb-2">Métricas e Metas</h4>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] text-zinc-500 font-bold block mb-1">Peso Inicial (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={initWeight}
                  onChange={(e) => setInitWeight(e.target.value)}
                  placeholder="Ex: 85.5"
                  className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-acid font-bold block mb-1">Peso Alvo (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  placeholder="Ex: 78.0"
                  className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                />
              </label>
            </div>

            {metricType === "composition" && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5 animate-[fadeIn_0.2s_ease-out]">
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] text-zinc-500 font-bold block mb-1">Gordura Inicial (%)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={initFat}
                      onChange={(e) => setInitFat(e.target.value)}
                      placeholder="Ex: 22.5"
                      className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-500 font-bold block mb-1">Massa Magra Inicial (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={initMuscle}
                      onChange={(e) => setInitMuscle(e.target.value)}
                      placeholder="Ex: 62.0"
                      className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] text-orange-500 font-bold block mb-1">Gordura Alvo (%)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={targetFat}
                      onChange={(e) => setTargetFat(e.target.value)}
                      placeholder="Ex: 15.0"
                      className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-cyan font-bold block mb-1">Massa Magra Alvo (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={targetMuscle}
                      onChange={(e) => setTargetMuscle(e.target.value)}
                      placeholder="Ex: 65.0"
                      className="w-full h-10 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-2xl bg-acid text-black font-black text-sm flex items-center justify-center cursor-pointer transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? "Criando seu Projeto..." : "Iniciar Novo Projeto"}
        </button>
      </form>
    </div>
  );
}

function ProjectDashboard({
  project,
  onUpdate
}: {
  project: Project;
  onUpdate: () => void;
}) {
  const [selectedTab, setSelectedTab] = useState<"weight" | "fatPct" | "muscleMass">("weight");
  const [showAddForm, setShowAddForm] = useState(false);

  // Campos para nova medição
  const [weight, setWeight] = useState("");
  const [fatPct, setFatPct] = useState("");
  const [muscleMass, setMuscleMass] = useState("");
  const [date, setDate] = useState(() => getLocalDateStr(new Date()));

  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");

  const getGoalTypeLabel = (type: string) => {
    switch (type) {
      case "emagrecimento": return "Emagrecimento";
      case "ganho_massa": return "Ganho de Massa";
      case "manutencao": return "Manutenção/Definição";
      default: return "Objetivos Físicos";
    }
  };

  // Cálculo de dias restantes
  const tStart = new Date(project.startDate + "T00:00:00").getTime();
  const tEnd = new Date(project.endDate + "T00:00:00").getTime();
  const tToday = new Date(getLocalDateStr(new Date()) + "T00:00:00").getTime();

  const totalDays = project.durationDays;
  const daysPassed = Math.max(0, Math.round((tToday - tStart) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, totalDays - daysPassed);
  const timeProgressPct = Math.min(100, Math.round((daysPassed / totalDays) * 100));

  // Última medição inserida
  const measurements = project.measurements || [];
  const latestMeasurement = measurements.length > 0 ? measurements[measurements.length - 1] : null;

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      setError("Por favor, insira um peso válido.");
      return;
    }

    setLoading(true);
    try {
      await addProjectMeasurementAction(project._id!, {
        date,
        weight: w,
        fatPct: project.metricType === "composition" && fatPct ? parseFloat(fatPct) : undefined,
        muscleMass: project.metricType === "composition" && muscleMass ? parseFloat(muscleMass) : undefined
      });

      // Limpa campos
      setWeight("");
      setFatPct("");
      setMuscleMass("");
      setShowAddForm(false);
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Erro ao adicionar medição.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeasurement = async (measDate: string) => {
    if (!confirm(`Tem certeza que deseja excluir a medição de ${measDate}?`)) return;

    setDeleteLoading(true);
    try {
      await deleteProjectMeasurementAction(project._id!, measDate);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir medição.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelProject = async () => {
    if (!confirm("Aviso: Cancelar este projeto irá arquivar seu progresso atual e você não poderá adicionar novas medições. Continuar?")) return;

    try {
      await deleteProjectAction(project._id!);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Erro ao arquivar projeto.");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 pb-4 animate-[fadeIn_0.2s_ease-out] space-y-3">
      {/* Card Header do Projeto */}
      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[9px] bg-acid/20 text-acid px-2 py-0.5 rounded font-black uppercase tracking-wider">
              {getGoalTypeLabel(project.goalType)}
            </span>
            <h3 className="text-sm font-black text-white mt-1.5">{project.title}</h3>
            <p className="text-[10px] text-zinc-500 font-bold mt-0.5">
              Início: {project.startDate} &bull; Meta: {project.endDate}
            </p>
          </div>
          <button
            onClick={handleCancelProject}
            className="text-[10px] font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer"
          >
            Encerrar
          </button>
        </div>

        {/* Barra de Progresso do Tempo */}
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-zinc-400">Dia {daysPassed} de {totalDays}</span>
            <span className="text-zinc-500">{daysRemaining} dias restantes</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div 
              className="h-full bg-acid rounded-full transition-all duration-500" 
              style={{ width: `${timeProgressPct}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Seletor de Métricas para Gráfico (se Composição) */}
      {project.metricType === "composition" && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setSelectedTab("weight")}
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
              selectedTab === "weight" ? "bg-acid text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
            }`}
          >
            Peso
          </button>
          <button
            onClick={() => setSelectedTab("fatPct")}
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
              selectedTab === "fatPct" ? "bg-amber-500 text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
            }`}
          >
            Gordura %
          </button>
          <button
            onClick={() => setSelectedTab("muscleMass")}
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
              selectedTab === "muscleMass" ? "bg-cyan text-black font-black" : "bg-black/40 border border-white/5 text-zinc-400"
            }`}
          >
            Massa Magra
          </button>
        </div>
      )}

      {/* Gráfico SVG */}
      <ProjectProgressChart 
        project={project} 
        metricKey={project.metricType === "composition" ? selectedTab : "weight"} 
      />

      {/* Métricas Resumidas: Inicial, Atual, Meta */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
          <span className="text-[9px] text-zinc-500 font-bold uppercase block">Inicial</span>
          <span className="text-xs font-black text-zinc-400">
            {project.metricType === "composition" && selectedTab === "fatPct"
              ? `${project.initialMetrics.fatPct || "-"}%`
              : project.metricType === "composition" && selectedTab === "muscleMass"
              ? `${project.initialMetrics.muscleMass || "-"}kg`
              : `${project.initialMetrics.weight}kg`}
          </span>
        </div>
        <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
          <span className="text-[9px] text-zinc-500 font-bold uppercase block">Última</span>
          <span className="text-xs font-black text-white">
            {latestMeasurement
              ? (project.metricType === "composition" && selectedTab === "fatPct"
                ? `${latestMeasurement.fatPct || "-"}%`
                : project.metricType === "composition" && selectedTab === "muscleMass"
                ? `${latestMeasurement.muscleMass || "-"}kg`
                : `${latestMeasurement.weight}kg`)
              : "-"}
          </span>
        </div>
        <div className="bg-black/20 border border-white/5 p-2 rounded-xl text-center">
          <span className="text-[9px] text-zinc-500 font-bold uppercase block">Meta</span>
          <span className="text-xs font-black text-acid">
            {project.metricType === "composition" && selectedTab === "fatPct"
              ? `${project.targetMetrics.fatPct || "-"}%`
              : project.metricType === "composition" && selectedTab === "muscleMass"
              ? `${project.targetMetrics.muscleMass || "-"}kg`
              : `${project.targetMetrics.weight}kg`}
          </span>
        </div>
      </div>

      {/* Seção Registrar Medição */}
      {showAddForm ? (
        <form onSubmit={handleAddMeasurement} className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <h4 className="text-[10px] text-zinc-300 uppercase font-black">Nova Medição</h4>
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="text-[10px] text-zinc-500 hover:text-white font-bold cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs p-2 rounded-lg font-bold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[9px] text-zinc-500 font-bold block mb-1">Data</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              />
            </label>

            <label className="block">
              <span className="text-[9px] text-zinc-500 font-bold block mb-1">Peso (kg)</span>
              <input
                type="number"
                step="0.1"
                required
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Ex: 84.2"
                className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
              />
            </label>
          </div>

          {project.metricType === "composition" && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <label className="block">
                <span className="text-[9px] text-zinc-500 font-bold block mb-1">Gordura (%)</span>
                <input
                  type="number"
                  step="0.1"
                  value={fatPct}
                  onChange={(e) => setFatPct(e.target.value)}
                  placeholder="Ex: 21.0"
                  className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                />
              </label>

              <label className="block">
                <span className="text-[9px] text-zinc-500 font-bold block mb-1">Massa Magra (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  value={muscleMass}
                  onChange={(e) => setMuscleMass(e.target.value)}
                  placeholder="Ex: 62.5"
                  className="w-full h-9 px-2.5 text-xs rounded bg-black/60 border border-white/10 text-white outline-none focus:border-acid"
                />
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-xl bg-acid text-black font-black text-xs flex items-center justify-center cursor-pointer transition hover:scale-[1.01]"
          >
            {loading ? "Salvando..." : "Salvar Medição"}
          </button>
        </form>
      ) : (
        <button
          onClick={() => {
            setDate(getLocalDateStr(new Date()));
            setShowAddForm(true);
          }}
          className="w-full h-11 border border-dashed border-white/10 hover:border-acid/30 text-[11px] text-zinc-400 hover:text-acid font-bold rounded-2xl transition flex items-center justify-center gap-1.5 cursor-pointer bg-black/10"
        >
          <Plus size={14} /> Registrar Medição de Progresso
        </button>
      )}

      {/* Histórico de Medições */}
      <div className="bg-black/20 border border-white/5 p-4 rounded-2xl space-y-2">
        <h4 className="text-[10px] text-zinc-400 uppercase font-black tracking-wider">Histórico de Pesagens</h4>
        {measurements.length === 0 ? (
          <p className="text-[10px] text-zinc-600 text-center py-2">Nenhuma medição registrada ainda.</p>
        ) : (
          <div className="divide-y divide-white/5 max-h-48 overflow-y-auto pr-1">
            {measurements.slice().reverse().map((meas, idx) => (
              <div key={idx} className="flex justify-between items-center py-2 text-[10px] font-bold text-zinc-400">
                <div>
                  <span className="text-white block">{meas.date.split("-").reverse().join("/")}</span>
                  <span className="text-[9px] text-zinc-500 font-bold block mt-0.5">
                    {project.metricType === "composition"
                      ? `Gordura: ${meas.fatPct || "-"}% | Massa Magra: ${meas.muscleMass || "-"}kg`
                      : "Apenas Peso"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-200 font-black">{meas.weight} kg</span>
                  {meas.date !== project.startDate && (
                    <button
                      onClick={() => handleDeleteMeasurement(meas.date)}
                      disabled={deleteLoading}
                      className="text-red-500 hover:text-red-400 cursor-pointer"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
