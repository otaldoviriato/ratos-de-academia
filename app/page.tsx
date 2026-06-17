"use client";

import { SignIn, UserButton, useUser } from "@clerk/nextjs";
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
  AlertTriangle
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getDailyActivities,
  toggleActivity,
  savePlanAction,
  updateActivityOccurrence,
  deleteActivityAction,
  getPendingCountAction,
  ActivityItem,
  PlanType,
  WorkoutExercise,
  DietItem,
  MedItem,
  BloodExamItem,
  PlanDetails
} from "./actions";

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
  { type: "medicamento", title: "Medicamento", text: "Dose e horário", icon: Pill },
  { type: "dieta", title: "Dieta", text: "Refeições e calorias", icon: Utensils }
];

export default function Home() {
  const { isLoaded, isSignedIn } = useUser();
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateStr(new Date()));
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDates, setPendingDates] = useState<string[]>([]);
  const [editing, setEditing] = useState<ActivityItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Carrega dados da data selecionada e contagem de pendências
  const loadData = () => {
    if (!isSignedIn) return;
    
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

  useEffect(() => {
    loadData();
  }, [selectedDate, isSignedIn]);

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
    activities.forEach(a => {
      if (a.done) {
        if (a.type === "musculacao") workoutsDone++;
        if (a.type === "aerobico" && a.details.aerobic) {
          cardioMin += a.details.aerobic.duration;
        }
      }
    });

    return { total, completed, pct, workoutsDone, cardioMin };
  }, [activities]);

  const selectedLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

  if (!isLoaded) {
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
      ) : (
        <main className="min-h-dvh overflow-hidden bg-coal text-zinc-50 sm:grid sm:place-items-center sm:p-6">
          <div className="subtle-grid fixed inset-0 opacity-25" />
          
          <section className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-coal px-4 py-4 shadow-2xl shadow-black/50 sm:h-[860px] sm:max-h-[92dvh] sm:rounded-[2rem] sm:border sm:border-white/10">
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
                  Ratos de Academia
                </p>
                <h1 className="mt-1 text-2xl font-black text-white">
                  {selectedLabel}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDay(-1)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                  aria-label="Dia anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => navigateDay(1)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                  aria-label="Próximo dia"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "h-7 w-7"
                      }
                    }}
                  />
                </div>
              </div>
            </header>

            {/* Calendário Semanal Dinâmico */}
            <section className="mt-4 shrink-0 rounded-lg border border-white/10 bg-white/[0.045] p-3 backdrop-blur-xl">
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((day) => (
                  <button
                    key={day.dateStr}
                    onClick={() => setSelectedDate(day.dateStr)}
                    className={[
                      "relative flex h-[58px] flex-col items-center justify-center rounded-lg border text-center transition",
                      selectedDate === day.dateStr
                        ? "border-acid bg-acid text-black"
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
              <section className="mt-3 shrink-0 rounded-lg border border-ember/20 bg-ember/15 px-3 py-2 flex items-center justify-between text-xs text-ember-300">
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
                  className="font-black underline uppercase tracking-wider text-[10px]"
                >
                  Resolver
                </button>
              </section>
            )}

            {/* Painel de Progresso */}
            <section className="mt-3 shrink-0 rounded-lg border border-acid/20 bg-acid/10 p-3">
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

            {/* Lista de Atividades do Dia */}
            <section className="mt-3 min-h-0 flex-1 space-y-2 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between shrink-0">
                <h2 className="text-sm font-bold text-white">Plano do dia</h2>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-acid px-3 text-xs font-black text-black hover:bg-opacity-95"
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
                      onToggle={() => handleToggleCheck(item)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Navegação Inferior */}
            <nav className="mt-3 grid h-14 shrink-0 grid-cols-4 rounded-lg border border-white/10 bg-white/[0.055] p-1 backdrop-blur-xl">
              <NavButton active icon={HomeIcon} label="Hoje" onClick={() => setSelectedDate(getLocalDateStr(new Date()))} />
              <NavButton icon={CalendarDays} label="Agenda" onClick={() => {}} />
              <NavButton icon={HeartPulse} label="Saúde" onClick={() => {}} />
              <NavButton icon={Settings2} label="Ajustes" onClick={() => {}} />
            </nav>
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
    <main className="grid min-h-dvh place-items-center bg-coal p-4">
      <div className="subtle-grid fixed inset-0 opacity-25" />
      <div className="relative z-10 w-full max-w-[400px]">
        <SignIn routing="hash" />
      </div>
    </main>
  );
}

function PlanRow({ 
  item, 
  onEdit,
  onToggle
}: { 
  item: ActivityItem; 
  onEdit: () => void;
  onToggle: () => void;
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
      case "medicamento":
        return {
          icon: Pill,
          accent: "text-violet-300",
          desc: item.details.meds?.[0]?.name || "Medicamento",
          amount: `${item.details.meds?.length || 0} itens`
        };
      case "dieta":
        return {
          icon: Utensils,
          accent: "text-emerald-300",
          desc: "Plano Alimentar",
          amount: `${item.details.dietItems?.length || 0} refeições`
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

  if (item.status === "skipped") {
    return (
      <article className="grid min-h-0 grid-cols-[44px_minmax(0,1fr)_42px] items-center gap-3 rounded-lg border border-dashed border-white/5 bg-white/[0.01] px-3 py-2 opacity-40">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-black/10 text-zinc-500">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-zinc-500 line-through">{item.title}</h3>
          <p className="text-xs text-zinc-600">Pulado hoje</p>
        </div>
        <button
          onClick={onToggle}
          className="grid h-10 w-10 place-items-center rounded-lg border border-white/5 bg-black/10 text-zinc-600 hover:text-zinc-400"
          aria-label="Restaurar atividade"
        >
          <RotateCw size={15} />
        </button>
      </article>
    );
  }

  return (
    <article className="grid min-h-0 grid-cols-[44px_minmax(0,1fr)_42px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 backdrop-blur-xl hover:border-white/20 transition">
      <button
        onClick={onEdit}
        className={`grid h-11 w-11 place-items-center rounded-lg bg-black/25 hover:bg-black/40 transition ${info.accent}`}
        aria-label={`Editar ${item.title}`}
      >
        <Icon size={20} />
      </button>
      <button onClick={onEdit} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-white">{item.title}</h3>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
            {item.tag}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-400">
          {info.desc} - {info.amount}
        </p>
      </button>
      <button
        onClick={onToggle}
        className={[
          "grid h-10 w-10 place-items-center rounded-lg border transition",
          item.done
            ? "border-acid bg-acid text-black"
            : "border-white/10 bg-black/20 text-zinc-500 hover:border-zinc-500"
        ].join(" ")}
        aria-label={item.done ? "Concluído" : "Marcar como concluído"}
      >
        <Check size={18} />
      </button>
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

  // Manipuladores de check individual
  const toggleSubItemDone = (index: number) => {
    const nextDetails = { ...details };
    
    if (item.type === "musculacao" && nextDetails.routine && nextDetails.workouts?.[nextDetails.routine]) {
      const list = nextDetails.workouts[nextDetails.routine];
      list[index].done = !list[index].done;
    } else if (item.type === "dieta" && nextDetails.dietItems) {
      nextDetails.dietItems[index].done = !nextDetails.dietItems[index].done;
    } else if (item.type === "medicamento" && nextDetails.meds) {
      nextDetails.meds[index].done = !nextDetails.meds[index].done;
    } else if (item.type === "sangue" && nextDetails.bloodExams) {
      nextDetails.bloodExams[index].done = !nextDetails.bloodExams[index].done;
    } else if (item.type === "aerobico" && nextDetails.aerobic) {
      nextDetails.aerobic.done = !nextDetails.aerobic.done;
    } else if (item.type === "bioimpedancia" && nextDetails.bio) {
      nextDetails.bio.done = !nextDetails.bio.done;
    }
    
    setDetails(nextDetails);
  };

  // Alteração de campos individuais
  const handleWorkoutLoadChange = (index: number, val: string) => {
    const next = { ...details };
    if (next.routine && next.workouts?.[next.routine]) {
      next.workouts[next.routine][index].load = val;
      setDetails(next);
    }
  };

  const handleAerobicDurationChange = (val: number) => {
    const next = { ...details };
    if (next.aerobic) {
      next.aerobic.duration = val;
      setDetails(next);
    }
  };

  const handleBioChange = (field: "weight" | "fatPct" | "muscleMass", val: number) => {
    const next = { ...details };
    if (!next.bio) next.bio = {};
    next.bio[field] = val;
    setDetails(next);
  };

  const handleBloodValueChange = (index: number, val: string) => {
    const next = { ...details };
    if (next.bloodExams) {
      next.bloodExams[index].value = val;
      setDetails(next);
    }
  };

  // Salvar ocorrência
  const handleSave = async (scope: "today" | "all") => {
    setIsSaving(true);
    try {
      await updateActivityOccurrence(
        dateStr,
        item.planId || "",
        item.occurrenceId,
        details,
        scope,
        item.type
      );
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar alterações");
    } finally {
      setIsSaving(false);
    }
  };

  // Pular / Excluir ocorrência
  const handleDelete = async (scope: "today" | "all") => {
    if (!item.planId) return;
    setIsSaving(true);
    try {
      await deleteActivityAction(dateStr, item.planId, item.occurrenceId, scope);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir atividade");
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[1.25rem] border border-white/10 bg-graphite p-4 shadow-2xl max-h-[85vh] flex flex-col">
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
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo de Edição Específico */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1 text-zinc-200">
          {/* Musculação */}
          {item.type === "musculacao" && details.routine && details.workouts?.[details.routine] && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-acid uppercase tracking-wider">Exercícios do Treino {details.routine}</p>
              {details.workouts[details.routine].map((ex, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <button
                    onClick={() => toggleSubItemDone(idx)}
                    className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition ${
                      ex.done ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-600"
                    }`}
                  >
                    <Check size={14} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${ex.done ? "line-through text-zinc-500" : "text-white"}`}>
                      {ex.name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {ex.series}x{ex.reps} reps
                    </p>
                  </div>
                  <input
                    type="text"
                    value={ex.load}
                    onChange={(e) => handleWorkoutLoadChange(idx, e.target.value)}
                    placeholder="Carga"
                    className="w-16 h-8 text-center text-xs font-bold rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Dieta */}
          {item.type === "dieta" && details.dietItems && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Refeições / Alimentos</p>
              {details.dietItems.map((alimento, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <button
                    onClick={() => toggleSubItemDone(idx)}
                    className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition ${
                      alimento.done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/10 text-zinc-600"
                    }`}
                  >
                    <Check size={14} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${alimento.done ? "line-through text-zinc-500" : "text-white"}`}>
                      {alimento.name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Qtd: {alimento.amount}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-300 shrink-0">{alimento.calories} kcal</span>
                </div>
              ))}
            </div>
          )}

          {/* Cardio */}
          {item.type === "aerobico" && details.aerobic && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-cyan uppercase tracking-wider">Atividade Aeróbica</p>
              <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{details.aerobic.name}</span>
                  <button
                    onClick={() => toggleSubItemDone(0)}
                    className={`h-8 px-3 rounded-md border text-xs font-bold flex items-center gap-1 transition ${
                      details.aerobic.done ? "border-cyan bg-cyan text-black" : "border-white/10 text-zinc-400"
                    }`}
                  >
                    <Check size={14} /> {details.aerobic.done ? "Concluído" : "Pendente"}
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
            </div>
          )}

          {/* Medicamento */}
          {item.type === "medicamento" && details.meds && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-violet-300 uppercase tracking-wider">Medicamentos / Suplementos</p>
              {details.meds.map((med, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <button
                    onClick={() => toggleSubItemDone(idx)}
                    className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition ${
                      med.done ? "border-violet-300 bg-violet-300 text-black" : "border-white/10 text-zinc-600"
                    }`}
                  >
                    <Check size={14} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${med.done ? "line-through text-zinc-500" : "text-white"}`}>
                      {med.name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Dose: {med.dose} {med.time ? `• Horário: ${med.time}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bioimpedância */}
          {item.type === "bioimpedancia" && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-ember uppercase tracking-wider">Resultados de Bioimpedância</p>
              <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Marcar como realizado</span>
                  <button
                    onClick={() => toggleSubItemDone(0)}
                    className={`h-8 px-3 rounded-md border text-xs font-bold flex items-center gap-1 transition ${
                      details.bio?.done ? "border-ember bg-ember text-black" : "border-white/10 text-zinc-400"
                    }`}
                  >
                    <Check size={14} /> {details.bio?.done ? "Sim" : "Não"}
                  </button>
                </div>
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
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSubItemDone(idx)}
                      className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition ${
                        ex.done ? "border-rose-300 bg-rose-300 text-black" : "border-white/10 text-zinc-600"
                      }`}
                    >
                      <Check size={14} />
                    </button>
                    <span className={`text-sm font-bold ${ex.done ? "line-through text-zinc-500" : "text-white"}`}>
                      {ex.name}
                    </span>
                  </div>
                  <label className="block pl-10">
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
            </div>
          )}

          {/* Alerta de Aplicação */}
          <div className="rounded-lg border border-ember/25 bg-ember/10 p-3 text-[11px] shrink-0">
            <div className="flex items-center gap-2 font-bold text-ember">
              <RotateCw size={14} className="animate-spin-slow" />
              <span>Escopo de Salvamento</span>
            </div>
            <p className="mt-1 text-zinc-400 leading-normal">
              Escolha se deseja salvar apenas para o dia selecionado (Só hoje) ou atualizar a regra padrão do plano (Todos).
            </p>
          </div>
        </div>

        {/* Ações Inferiores */}
        <div className="mt-4 grid grid-cols-2 gap-2 shrink-0">
          <button
            disabled={isSaving}
            onClick={() => handleSave("today")}
            className="h-10 rounded-lg border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50"
          >
            Só hoje
          </button>
          <button
            disabled={isSaving}
            onClick={() => handleSave("all")}
            className="h-10 rounded-lg bg-acid text-xs font-black text-black hover:opacity-95 disabled:opacity-50"
          >
            Todos
          </button>
          {item.planId && (
            <>
              <button
                disabled={isSaving}
                onClick={() => handleDelete("today")}
                className="h-9 rounded-lg border border-red-500/20 text-red-400/80 text-[11px] font-bold hover:bg-red-500/10 col-span-1 mt-1"
              >
                Pular hoje
              </button>
              <button
                disabled={isSaving}
                onClick={() => handleDelete("all")}
                className="h-9 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] font-black hover:bg-red-500/20 col-span-1 mt-1 flex items-center justify-center gap-1"
              >
                <Trash2 size={12} />
                Excluir plano
              </button>
            </>
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

  const [dietItems, setDietItems] = useState<Omit<DietItem, "done">[]>([
    { name: "Café da manhã", calories: 400, amount: "1 copo whey + banana" }
  ]);
  const [medsList, setMedsList] = useState<Omit<MedItem, "done">[]>([
    { name: "Creatina", dose: "5g", time: "08:00" }
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

  const addDietItem = () => {
    setDietItems([...dietItems, { name: "", calories: 150, amount: "100g" }]);
  };

  const removeDietItem = (idx: number) => {
    const updated = [...dietItems];
    updated.splice(idx, 1);
    setDietItems(updated);
  };

  const addMedsItem = () => {
    setMedsList([...medsList, { name: "", dose: "", time: "" }]);
  };

  const removeMedsItem = (idx: number) => {
    const updated = [...medsList];
    updated.splice(idx, 1);
    setMedsList(updated);
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
        details.dietItems = dietItems.filter(i => i.name.trim());
      } else if (type === "aerobico") {
        details.aerobic = { name: aerobicName, duration: aerobicDuration };
      } else if (type === "medicamento") {
        details.meds = medsList.filter(i => i.name.trim());
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[1.25rem] border border-white/10 bg-graphite p-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-white">Adicionar Plano</h3>
            <p className="text-xs text-zinc-400">Preencha e planeje seu calendário.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"
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
                  className="rounded-lg border border-white/10 bg-black/20 p-3 text-left hover:border-acid/30 hover:bg-black/40 transition group"
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
                      className={`h-9 rounded-md text-xs font-bold border ${freqType === "daily" ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-300"}`}
                    >
                      Todo dia
                    </button>
                    <button
                      onClick={() => setFreqType("weekdays")}
                      className={`h-9 rounded-md text-xs font-bold border ${freqType === "weekdays" ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-300"}`}
                    >
                      Dias úteis
                    </button>
                    <button
                      onClick={() => setFreqType("alternate")}
                      className={`h-9 rounded-md text-xs font-bold border ${freqType === "alternate" ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-300"}`}
                    >
                      Dia sim/não
                    </button>
                  </>
                )}
                {type === "musculacao" && (
                  <button
                    onClick={() => setFreqType("rotation")}
                    className={`h-9 rounded-md text-xs font-bold border ${freqType === "rotation" ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-300"} col-span-3`}
                  >
                    Rotação de Treinos (Ex: ABC, ABCD)
                  </button>
                )}
                <button
                  onClick={() => setFreqType("custom")}
                  className={`h-9 rounded-md text-xs font-bold border ${freqType === "custom" ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-300"} col-span-3`}
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
                          className={`h-7 w-7 text-[10px] font-bold rounded-full border ${
                            customDays.includes(idx) ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-400"
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
                        className={`h-8 w-8 text-[11px] font-bold rounded-full border ${
                          customDays.includes(idx) ? "border-acid bg-acid text-black" : "border-white/10 text-zinc-400"
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
                      className={`h-7 px-3 text-xs font-bold rounded ${activeRoutineTab === letter ? "bg-acid text-black font-black" : "bg-white/5 text-zinc-400"}`}
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
                        placeholder="Carga"
                        className="w-14 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <button
                        type="button"
                        onClick={() => removeExercise(idx)}
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addExercise}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10"
                  >
                    <Plus size={14} /> Adicionar Exercício ao Treino {activeRoutineTab}
                  </button>
                </div>
              </div>
            )}

            {/* Dieta */}
            {type === "dieta" && (
              <div className="space-y-3">
                <span className="text-xs text-zinc-400 block">Itens da Dieta / Refeições</span>
                <div className="space-y-2">
                  {dietItems.map((item, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center bg-black/25 p-2 rounded-lg border border-white/5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...dietItems];
                          updated[idx].name = e.target.value;
                          setDietItems(updated);
                        }}
                        placeholder="Alimento / Refeição"
                        className="flex-1 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="text"
                        value={item.amount}
                        onChange={(e) => {
                          const updated = [...dietItems];
                          updated[idx].amount = e.target.value;
                          setDietItems(updated);
                        }}
                        placeholder="Ex: 200g, 1 un"
                        className="w-20 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="number"
                        value={item.calories}
                        onChange={(e) => {
                          const updated = [...dietItems];
                          updated[idx].calories = Number(e.target.value);
                          setDietItems(updated);
                        }}
                        placeholder="kcal"
                        className="w-16 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <button
                        type="button"
                        onClick={() => removeDietItem(idx)}
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDietItem}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10"
                  >
                    <Plus size={14} /> Adicionar Alimento
                  </button>
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

            {/* Medicamento / Suplemento */}
            {type === "medicamento" && (
              <div className="space-y-3">
                <span className="text-xs text-zinc-400 block">Itens de Medicamentos / Suplementos</span>
                <div className="space-y-2">
                  {medsList.map((med, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center bg-black/25 p-2 rounded-lg border border-white/5">
                      <input
                        type="text"
                        value={med.name}
                        onChange={(e) => {
                          const updated = [...medsList];
                          updated[idx].name = e.target.value;
                          setMedsList(updated);
                        }}
                        placeholder="Nome do suplemento/méd"
                        className="flex-1 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="text"
                        value={med.dose}
                        onChange={(e) => {
                          const updated = [...medsList];
                          updated[idx].dose = e.target.value;
                          setMedsList(updated);
                        }}
                        placeholder="Dose (Ex: 5g, 1 caps)"
                        className="w-24 h-8 px-2 text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <input
                        type="text"
                        value={med.time || ""}
                        onChange={(e) => {
                          const updated = [...medsList];
                          updated[idx].time = e.target.value;
                          setMedsList(updated);
                        }}
                        placeholder="08:00"
                        className="w-16 h-8 text-center text-xs rounded bg-black/40 border border-white/10 text-white outline-none focus:border-acid"
                      />
                      <button
                        type="button"
                        onClick={() => removeMedsItem(idx)}
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addMedsItem}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10"
                  >
                    <Plus size={14} /> Adicionar Item
                  </button>
                </div>
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
                        className="h-8 w-8 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExamItem}
                    className="w-full h-8 rounded border border-dashed border-acid/20 text-acid bg-acid/5 text-xs font-bold flex items-center justify-center gap-1 hover:bg-acid/10"
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
                className="h-10 rounded-lg border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                disabled={isSaving}
                onClick={handleSavePlan}
                className="h-10 rounded-lg bg-acid text-xs font-black text-black hover:opacity-95 disabled:opacity-50"
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
        "flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-bold transition",
        active ? "bg-acid text-black font-black" : "text-zinc-500 hover:text-zinc-400"
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
