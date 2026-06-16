"use client";

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
  X
} from "lucide-react";
import { useMemo, useState } from "react";

type PlanItem = {
  title: string;
  detail: string;
  amount: string;
  tag: string;
  done: boolean;
  icon: React.ElementType;
  accent: string;
};

const week = [
  { day: "S", date: "15", status: "done" },
  { day: "T", date: "16", status: "today" },
  { day: "Q", date: "17", status: "planned" },
  { day: "Q", date: "18", status: "planned" },
  { day: "S", date: "19", status: "planned" },
  { day: "S", date: "20", status: "rest" },
  { day: "D", date: "21", status: "rest" }
];

const planItems: PlanItem[] = [
  {
    title: "Musculacao",
    detail: "Treino B",
    amount: "Costas + biceps",
    tag: "ABCD",
    done: true,
    icon: Dumbbell,
    accent: "text-acid"
  },
  {
    title: "Aerobico",
    detail: "Zona 2",
    amount: "30 min",
    tag: "Diario",
    done: false,
    icon: Timer,
    accent: "text-cyan"
  },
  {
    title: "Bioimpedancia",
    detail: "Avaliacao",
    amount: "18:30",
    tag: "Mensal",
    done: false,
    icon: Activity,
    accent: "text-ember"
  },
  {
    title: "Sangue",
    detail: "Painel completo",
    amount: "Jejum",
    tag: "2 meses",
    done: false,
    icon: TestTube2,
    accent: "text-rose-300"
  },
  {
    title: "Medicamento",
    detail: "Rotina diaria",
    amount: "08:00",
    tag: "Diario",
    done: false,
    icon: Pill,
    accent: "text-violet-300"
  },
  {
    title: "Dieta",
    detail: "Plano alimentar",
    amount: "5 refeicoes",
    tag: "Diario",
    done: false,
    icon: Utensils,
    accent: "text-emerald-300"
  }
];

const addOptions: Array<{
  title: string;
  text: string;
  icon: React.ElementType;
}> = [
  { title: "Musculacao", text: "ABCD e frequencia", icon: Dumbbell },
  { title: "Aerobico", text: "Tempo e intensidade", icon: Timer },
  { title: "Bioimpedancia", text: "Mensal ou bimestral", icon: Activity },
  { title: "Exames", text: "Sangue e recorrencia", icon: TestTube2 },
  { title: "Medicamento", text: "Dose e horario", icon: Pill },
  { title: "Dieta", text: "Refeicoes e macros", icon: Utensils }
];

export default function Home() {
  const [isLogged, setIsLogged] = useState(false);
  const [selected, setSelected] = useState("16");
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const selectedLabel = useMemo(() => {
    const item = week.find((day) => day.date === selected);
    return item?.date === "16" ? "Hoje" : `Dia ${item?.date}`;
  }, [selected]);

  if (!isLogged) {
    return <LoginScreen onEnter={() => setIsLogged(true)} />;
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-coal text-zinc-50 sm:grid sm:place-items-center sm:p-6">
      <div className="subtle-grid fixed inset-0 opacity-25" />
      <section className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-coal px-4 py-4 shadow-2xl shadow-black/50 sm:h-[860px] sm:max-h-[92dvh] sm:rounded-[2rem] sm:border sm:border-white/10">
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
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300"
              aria-label="Proximo dia"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <section className="mt-4 shrink-0 rounded-lg border border-white/10 bg-white/[0.045] p-3 backdrop-blur-xl">
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((day) => (
              <button
                key={day.date}
                onClick={() => setSelected(day.date)}
                className={[
                  "relative flex h-[58px] flex-col items-center justify-center rounded-lg border text-center transition",
                  selected === day.date
                    ? "border-acid bg-acid text-black"
                    : "border-white/10 bg-black/20 text-zinc-300"
                ].join(" ")}
              >
                <span className="text-[11px] font-semibold">{day.day}</span>
                <span className="text-base font-black">{day.date}</span>
                <span
                  className={[
                    "absolute bottom-1.5 h-1 w-1 rounded-full",
                    selected === day.date
                      ? "bg-black"
                      : day.status === "done"
                        ? "bg-acid"
                        : day.status === "rest"
                          ? "bg-zinc-600"
                          : "bg-ember"
                  ].join(" ")}
                />
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 shrink-0 rounded-lg border border-acid/20 bg-acid/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-zinc-400">Progresso</p>
              <p className="text-lg font-black text-white">1/6 concluido</p>
            </div>
            <div className="flex items-center gap-2 text-right">
              <Metric label="Treinos" value="5x" />
              <Metric label="Cardio" value="150m" />
              <Metric label="Serie" value="12d" />
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-black/35">
            <div className="h-2 w-1/6 rounded-full bg-acid" />
          </div>
        </section>

        <section className="mt-3 min-h-0 flex-1 space-y-2 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Plano do dia</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-acid px-3 text-xs font-black text-black"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
          <div className="mobile-scroll h-full space-y-2 overflow-y-auto overscroll-contain pb-2 pr-1">
            {planItems.map((item) => (
              <PlanRow
                key={item.title}
                item={item}
                onEdit={() => setEditing(item)}
              />
            ))}
          </div>
        </section>

        <nav className="mt-3 grid h-14 shrink-0 grid-cols-4 rounded-lg border border-white/10 bg-white/[0.055] p-1 backdrop-blur-xl">
          <NavButton active icon={HomeIcon} label="Hoje" />
          <NavButton icon={CalendarDays} label="Agenda" />
          <NavButton icon={HeartPulse} label="Saude" />
          <NavButton icon={Settings2} label="Ajustes" />
        </nav>
      </section>

      {editing ? <EditSheet item={editing} onClose={() => setEditing(null)} /> : null}
      {showAdd ? <AddSheet onClose={() => setShowAdd(false)} /> : null}
    </main>
  );
}

function LoginScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="grid h-dvh overflow-hidden bg-coal px-5 py-5 text-white sm:place-items-center sm:p-6">
      <div className="subtle-grid fixed inset-0 opacity-25" />
      <section className="relative mx-auto flex h-full w-full max-w-[430px] flex-col justify-between overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/45 backdrop-blur-xl sm:h-[760px]">
        <div className="flex items-center justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-acid text-black shadow-glow">
            <Dumbbell size={25} />
          </div>
          <span className="rounded-lg border border-acid/20 bg-acid/10 px-3 py-1.5 text-xs font-bold text-acid">
            MVP
          </span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-acid">
            Ratos de Academia
          </p>
          <h1 className="mt-3 text-[2.65rem] font-black leading-[0.92] text-white">
            Treino no calendario.
          </h1>
          <p className="mt-4 text-sm leading-6 text-zinc-300">
            Abra, veja o dia, marque o que fez e ajuste musculacao, cardio e
            exames em poucos toques.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <LoginStat icon={CalendarDays} label="Hoje" value="4 itens" />
          <LoginStat icon={Dumbbell} label="Treino" value="ABCD" />
          <LoginStat icon={Flame} label="Serie" value="12d" />
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Email</span>
            <input
              defaultValue="atleta@ratos.fit"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-acid/60"
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1.5 block text-xs text-zinc-400">Senha</span>
            <input
              type="password"
              defaultValue="ratos123"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-acid/60"
            />
          </label>
        </div>

        <button
          onClick={onEnter}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-acid text-sm font-black text-black"
        >
          <LogIn size={18} />
          Entrar
        </button>
      </section>
    </main>
  );
}

function PlanRow({ item, onEdit }: { item: PlanItem; onEdit: () => void }) {
  const Icon = item.icon;

  return (
    <article className="grid min-h-0 grid-cols-[44px_minmax(0,1fr)_42px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 backdrop-blur-xl">
      <button
        onClick={onEdit}
        className={`grid h-11 w-11 place-items-center rounded-lg bg-black/25 ${item.accent}`}
        aria-label={`Editar ${item.title}`}
      >
        <Icon size={20} />
      </button>
      <button onClick={onEdit} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-white">{item.title}</h3>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
            {item.tag}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-400">
          {item.detail} - {item.amount}
        </p>
      </button>
      <button
        className={[
          "grid h-10 w-10 place-items-center rounded-lg border",
          item.done
            ? "border-acid bg-acid text-black"
            : "border-white/10 bg-black/20 text-zinc-500"
        ].join(" ")}
        aria-label={item.done ? "Concluido" : "Marcar como concluido"}
      >
        <Check size={18} />
      </button>
    </article>
  );
}

function EditSheet({ item, onClose }: { item: PlanItem; onClose: () => void }) {
  const Icon = item.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[1.25rem] border border-white/10 bg-graphite p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] ${item.accent}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black text-white">{item.title}</h3>
              <p className="text-xs text-zinc-400">Editar planejado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Qtd.</span>
            <input
              defaultValue={item.title === "Aerobico" ? "20 min" : item.amount}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-acid/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Repetir</span>
            <select className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-acid/60">
              <option>Hoje</option>
              <option>Todos</option>
              <option>Semana</option>
              <option>Mensal</option>
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-ember/25 bg-ember/10 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-ember">
            <RotateCw size={15} />
            Aplicar mudanca
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Escolha se muda apenas este dia ou toda a recorrencia.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="h-10 rounded-lg border border-white/10 text-xs font-bold text-zinc-300">
            So hoje
          </button>
          <button
            onClick={onClose}
            className="h-10 rounded-lg bg-acid text-xs font-black text-black"
          >
            Todos
          </button>
        </div>
      </div>
    </div>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-[1.25rem] border border-white/10 bg-graphite p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-white">Adicionar</h3>
            <p className="text-xs text-zinc-400">Preencha o calendario.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {addOptions.map(({ title, text, icon: Icon }) => (
            <button
              key={title}
              className="rounded-lg border border-white/10 bg-black/20 p-3 text-left"
            >
              <Icon className="mb-2 text-acid" size={20} />
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{text}</p>
            </button>
          ))}
        </div>
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
  label
}: {
  active?: boolean;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      className={[
        "flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-bold",
        active ? "bg-acid text-black" : "text-zinc-500"
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
