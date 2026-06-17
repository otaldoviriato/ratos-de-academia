"use server";

import clientPromise from "../lib/db";
import { ObjectId } from "mongodb";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export type WorkoutExercise = {
  name: string;
  series: number;
  reps: number;
  load: string;
  done?: boolean;
};

export type DietItem = {
  name: string;
  calories: number;
  amount: string;
  done?: boolean;
};

export type MedItem = {
  name: string;
  dose: string;
  time?: string;
  done?: boolean;
};

export type BloodExamItem = {
  name: string;
  value?: string;
  done?: boolean;
};

export type PlanDetails = {
  // Musculação
  routine?: string; // Letra do treino atual no dia (ex: 'A', 'B')
  workouts?: {
    [key: string]: WorkoutExercise[];
  };
  // Dieta
  dietItems?: DietItem[];
  // Aeróbico
  aerobic?: {
    name: string;
    duration: number; // em minutos
    done?: boolean;
  };
  // Medicamento
  meds?: MedItem[];
  // Bioimpedância
  bio?: {
    weight?: number;
    fatPct?: number;
    muscleMass?: number;
    done?: boolean;
  };
  // Sangue
  bloodExams?: BloodExamItem[];
};

export type PlanType = "musculacao" | "dieta" | "aerobico" | "medicamento" | "bioimpedancia" | "sangue";

export type Plan = {
  _id?: string;
  userId: string;
  type: PlanType;
  title: string;
  frequency: {
    type: "daily" | "alternate" | "weekdays" | "custom" | "rotation";
    daysOfWeek?: number[]; // [0 = Domingo, 1 = Segunda, ...]
    rotationRoutine?: string[]; // ['A', 'B', 'C', 'D']
    rotationDays?: number[]; // [1, 2, 3, 4, 5]
  };
  startDate: string; // "YYYY-MM-DD"
  endDate?: string;  // "YYYY-MM-DD"
  details: PlanDetails;
  isDeleted?: boolean;
  createdAt?: string;
};

export type Occurrence = {
  _id?: string;
  userId: string;
  planId?: string;
  date: string; // "YYYY-MM-DD"
  type: PlanType;
  status: "pending" | "done" | "skipped";
  isOverride: boolean;
  details?: PlanDetails;
  updatedAt?: string;
};

export type ActivityItem = {
  id: string; // planId ou occurrenceId
  planId?: string;
  occurrenceId?: string;
  type: PlanType;
  title: string;
  tag: string; // rótulo de frequência
  done: boolean;
  details: PlanDetails;
  status: "pending" | "done" | "skipped";
};

// Conecta ao Banco de Dados de forma auxiliar
async function getDb() {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB_NAME || "ratos_de_academia_prod");
}

// Verifica se um plano ocorre na data específica
function planAppliesToDate(plan: Plan, dateStr: string): { applies: boolean; routineLetter?: string } {
  if (plan.isDeleted) return { applies: false };
  if (plan.startDate > dateStr) return { applies: false };
  if (plan.endDate && plan.endDate < dateStr) return { applies: false };

  const [year, month, day] = dateStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo, 1 = Segunda, ...

  const [startYear, startMonth, startDay] = plan.startDate.split("-").map(Number);
  const startDateObj = new Date(Date.UTC(startYear, startMonth - 1, startDay));

  switch (plan.frequency.type) {
    case "daily":
      return { applies: true };
    case "weekdays":
      return { applies: dayOfWeek >= 1 && dayOfWeek <= 5 };
    case "custom":
      return { applies: !!plan.frequency.daysOfWeek?.includes(dayOfWeek) };
    case "alternate": {
      const diffTime = dateObj.getTime() - startDateObj.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return { applies: diffDays >= 0 && diffDays % 2 === 0 };
    }
    case "rotation": {
      const routine = plan.frequency.rotationRoutine || ["A"];
      const activeDays = plan.frequency.rotationDays || [1, 2, 3, 4, 5];

      // Se o dia da semana testado não for um dia ativo de treino
      if (!activeDays.includes(dayOfWeek)) {
        return { applies: false };
      }

      // Conta quantos dias de treino ativos se passaram desde o startDate até o dia testado
      let activeDaysCount = 0;
      let curr = new Date(startDateObj);
      while (curr <= dateObj) {
        if (activeDays.includes(curr.getUTCDay())) {
          activeDaysCount++;
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }

      if (activeDaysCount === 0) {
        return { applies: false };
      }

      const idx = (activeDaysCount - 1) % routine.length;
      const routineLetter = routine[idx >= 0 ? idx : 0];

      return { applies: true, routineLetter };
    }
    default:
      return { applies: false };
  }
}

// Retorna todas as atividades de um dia específico
export async function getDailyActivities(dateStr: string): Promise<ActivityItem[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // Busca planos
  const dbPlans = await db.collection("plans")
    .find({ userId, isDeleted: { $ne: true } })
    .toArray();

  const plans = dbPlans.map((p) => ({
    ...p,
    _id: p._id.toString(),
  })) as unknown as Plan[];

  // Busca ocorrências da data
  const dbOccurrences = await db.collection("occurrences")
    .find({ userId, date: dateStr })
    .toArray();

  const occurrences = dbOccurrences.map((o) => ({
    ...o,
    _id: o._id.toString(),
    planId: o.planId?.toString(),
  })) as unknown as Occurrence[];

  const activities: ActivityItem[] = [];

  // Mapeia os planos aplicáveis para o dia
  for (const plan of plans) {
    const { applies, routineLetter } = planAppliesToDate(plan, dateStr);

    if (applies) {
      // Procura ocorrência
      const occurrence = occurrences.find((o) => o.planId === plan._id);

      let status: "pending" | "done" | "skipped" = "pending";
      let details: PlanDetails = JSON.parse(JSON.stringify(plan.details));

      // Se for musculação rotativa, seleciona apenas a lista de exercícios correspondente
      if (plan.type === "musculacao" && routineLetter) {
        details.routine = routineLetter;
        // Caso os treinos daquela letra existam
        if (details.workouts && details.workouts[routineLetter]) {
          // Mantém apenas os exercícios da rotina de hoje no escopo da exibição
          const originalExercises = details.workouts[routineLetter];
          // Criamos a lista com o estado 'done' padrão como false
          details.workouts = {
            [routineLetter]: originalExercises.map(ex => ({ ...ex, done: !!ex.done }))
          };
        }
      }

      if (occurrence) {
        status = occurrence.status;
        if (occurrence.isOverride && occurrence.details) {
          // Se houve modificação específica para hoje
          details = JSON.parse(JSON.stringify(occurrence.details));
        } else if (occurrence.status === "done") {
          // Se a ocorrência foi marcada como concluída sem alterações profundas nos exercícios,
          // mas talvez os exercícios em si tenham marcadores de checks individuais.
          // Mesclamos o estado dos checks individuais se existirem na ocorrência
          if (occurrence.details) {
            details = JSON.parse(JSON.stringify(occurrence.details));
          } else {
            // Se o usuário deu um check global direto no card, todos os sub-itens são marcados
            details = markAllItemsAsDone(details, plan.type, details.routine || routineLetter);
          }
        }
      }

      activities.push({
        id: occurrence?._id || plan._id!,
        planId: plan._id,
        occurrenceId: occurrence?._id,
        type: plan.type,
        title: plan.type === "musculacao" && details.routine ? `${plan.title} - Treino ${details.routine}` : plan.title,
        tag: formatFrequencyTag(plan),
        done: status === "done",
        status,
        details,
      });
    }
  }

  // Busca ocorrências avulsas (sem planId) criadas para esse dia
  const extraOccurrences = occurrences.filter((o) => !o.planId);
  for (const occ of extraOccurrences) {
    activities.push({
      id: occ._id!,
      occurrenceId: occ._id,
      type: occ.type,
      title: occ.details?.routine ? `${occ.type === "musculacao" ? "Musculação" : occ.type} - Treino ${occ.details.routine}` : occ.type,
      tag: "Avulso",
      done: occ.status === "done",
      status: occ.status,
      details: occ.details || {},
    });
  }

  return activities;
}

// Auxiliar para marcar todas as tarefas de um plano como concluídas
function markAllItemsAsDone(details: PlanDetails, type: PlanType, routineLetter?: string): PlanDetails {
  const res = JSON.parse(JSON.stringify(details));
  if (type === "musculacao" && routineLetter && res.workouts && res.workouts[routineLetter]) {
    res.workouts[routineLetter] = res.workouts[routineLetter].map((e: WorkoutExercise) => ({ ...e, done: true }));
  } else if (type === "dieta" && res.dietItems) {
    res.dietItems = res.dietItems.map((e: DietItem) => ({ ...e, done: true }));
  } else if (type === "medicamento" && res.meds) {
    res.meds = res.meds.map((e: MedItem) => ({ ...e, done: true }));
  } else if (type === "aerobico" && res.aerobic) {
    res.aerobic.done = true;
  } else if (type === "bioimpedancia" && res.bio) {
    res.bio.done = true;
  } else if (type === "sangue" && res.bloodExams) {
    res.bloodExams = res.bloodExams.map((e: BloodExamItem) => ({ ...e, done: true }));
  }
  return res;
}

// Formata a label de frequência do plano
function formatFrequencyTag(plan: Plan): string {
  switch (plan.frequency.type) {
    case "daily":
      return "Diário";
    case "weekdays":
      return "Dias Úteis";
    case "alternate":
      return "Dia Sim/Não";
    case "custom":
      return "Personalizado";
    case "rotation":
      return `Rotação ${plan.frequency.rotationRoutine?.join("")}`;
    default:
      return "Recorrente";
  }
}

// Salva ou edita um plano
export async function savePlanAction(planData: Omit<Plan, "userId">): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();
  const { _id, ...rest } = planData;

  const doc = {
    ...rest,
    userId,
    updatedAt: new Date().toISOString(),
  };

  if (_id) {
    await db.collection("plans").updateOne(
      { _id: new ObjectId(_id), userId },
      { $set: doc }
    );
  } else {
    await db.collection("plans").insertOne({
      ...doc,
      createdAt: new Date().toISOString(),
    });
  }

  revalidatePath("/");
}

// Alterna o check global da atividade
export async function toggleActivity(
  dateStr: string,
  planIdStr?: string,
  occurrenceIdStr?: string,
  currentDone?: boolean,
  activityDetails?: PlanDetails,
  type?: PlanType
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();
  const newDone = !currentDone;
  const newStatus = newDone ? "done" : "pending";

  if (occurrenceIdStr) {
    // Se a ocorrência já existe no banco, atualiza o status global e os itens individuais
    const occ = await db.collection("occurrences").findOne({ _id: new ObjectId(occurrenceIdStr), userId });
    if (occ) {
      let updatedDetails = occ.details || activityDetails || {};
      if (type) {
        const routineLetter = updatedDetails.routine;
        if (newDone) {
          updatedDetails = markAllItemsAsDone(updatedDetails, type, routineLetter);
        } else {
          // Desmarca tudo
          updatedDetails = markAllItemsAsUndone(updatedDetails, type, routineLetter);
        }
      }

      await db.collection("occurrences").updateOne(
        { _id: new ObjectId(occurrenceIdStr), userId },
        {
          $set: {
            status: newStatus,
            details: updatedDetails,
            updatedAt: new Date().toISOString(),
          },
        }
      );
    }
  } else if (planIdStr) {
    // Se não existe, cria a ocorrência
    const plan = await db.collection("plans").findOne({ _id: new ObjectId(planIdStr), userId });
    if (plan) {
      let details = activityDetails || plan.details;
      // Garante que todos os itens estão consistentes com a ação de marcar/desmarcar tudo
      if (plan.type) {
        const routineLetter = details.routine;
        if (newDone) {
          details = markAllItemsAsDone(details, plan.type, routineLetter);
        } else {
          details = markAllItemsAsUndone(details, plan.type, routineLetter);
        }
      }

      await db.collection("occurrences").insertOne({
        userId,
        planId: new ObjectId(planIdStr),
        date: dateStr,
        type: plan.type,
        status: newStatus,
        isOverride: false,
        details,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  revalidatePath("/");
}

function markAllItemsAsUndone(details: PlanDetails, type: PlanType, routineLetter?: string): PlanDetails {
  const res = JSON.parse(JSON.stringify(details));
  if (type === "musculacao" && routineLetter && res.workouts && res.workouts[routineLetter]) {
    res.workouts[routineLetter] = res.workouts[routineLetter].map((e: WorkoutExercise) => ({ ...e, done: false }));
  } else if (type === "dieta" && res.dietItems) {
    res.dietItems = res.dietItems.map((e: DietItem) => ({ ...e, done: false }));
  } else if (type === "medicamento" && res.meds) {
    res.meds = res.meds.map((e: MedItem) => ({ ...e, done: false }));
  } else if (type === "aerobico" && res.aerobic) {
    res.aerobic.done = false;
  } else if (type === "bioimpedancia" && res.bio) {
    res.bio.done = false;
  } else if (type === "sangue" && res.bloodExams) {
    res.bloodExams = res.bloodExams.map((e: BloodExamItem) => ({ ...e, done: false }));
  }
  return res;
}

// Atualiza uma ocorrência (So hoje vs Todos os futuros)
export async function updateActivityOccurrence(
  dateStr: string,
  planIdStr: string,
  occurrenceIdStr: string | undefined,
  details: PlanDetails,
  scope: "today" | "all",
  type: PlanType
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // Calcula se a atividade deve ser considerada feita globalmente (se pelo menos uma de suas subtarefas ou todas estão feitas)
  // Deixaremos o usuário decidir o status ao clicar no check principal, mas podemos pré-calcular aqui
  let status: "pending" | "done" | "skipped" = "pending";
  if (type === "musculacao" && details.routine && details.workouts && details.workouts[details.routine]) {
    const list = details.workouts[details.routine];
    status = list.every(e => e.done) ? "done" : (list.some(e => e.done) ? "done" : "pending");
  } else if (type === "dieta" && details.dietItems) {
    status = details.dietItems.every(e => e.done) ? "done" : (details.dietItems.some(e => e.done) ? "done" : "pending");
  } else if (type === "medicamento" && details.meds) {
    status = details.meds.every(e => e.done) ? "done" : (details.meds.some(e => e.done) ? "done" : "pending");
  } else if (type === "aerobico" && details.aerobic) {
    status = details.aerobic.done ? "done" : "pending";
  } else if (type === "bioimpedancia" && details.bio) {
    status = details.bio.done ? "done" : "pending";
  } else if (type === "sangue" && details.bloodExams) {
    status = details.bloodExams.every(e => e.done) ? "done" : (details.bloodExams.some(e => e.done) ? "done" : "pending");
  }

  if (scope === "today") {
    if (occurrenceIdStr) {
      // Atualiza ocorrência existente
      await db.collection("occurrences").updateOne(
        { _id: new ObjectId(occurrenceIdStr), userId },
        {
          $set: {
            details,
            status,
            isOverride: true,
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } else {
      // Cria uma nova ocorrência que sobrescreve
      await db.collection("occurrences").insertOne({
        userId,
        planId: new ObjectId(planIdStr),
        date: dateStr,
        type,
        status,
        isOverride: true,
        details,
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    // Altera "Todos os futuros" -> Atualiza no plano original.
    // Como a musculação pode ter várias rotinas, se for musculação, precisamos preservar os outros treinos da rotina e apenas atualizar o treino específico modificado
    const plan = (await db.collection("plans").findOne({ _id: new ObjectId(planIdStr), userId })) as unknown as Plan | null;
    if (plan) {
      let updatedPlanDetails = { ...plan.details };
      if (type === "musculacao" && details.routine && details.workouts) {
        updatedPlanDetails.workouts = {
          ...plan.details.workouts,
          [details.routine]: details.workouts[details.routine].map((ex: WorkoutExercise) => ({
            name: ex.name,
            series: ex.series,
            reps: ex.reps,
            load: ex.load
            // não salvamos o 'done' no plano original, pois ele é referente à ocorrência
          }))
        };
      } else {
        // Para os outros tipos, atualizamos os dados base (tirando marcas de checks individuais)
        updatedPlanDetails = JSON.parse(JSON.stringify(details));
        // Remove done flags
        if (updatedPlanDetails.dietItems) {
          updatedPlanDetails.dietItems = updatedPlanDetails.dietItems.map((d: DietItem) => ({ name: d.name, calories: d.calories, amount: d.amount }));
        }
        if (updatedPlanDetails.meds) {
          updatedPlanDetails.meds = updatedPlanDetails.meds.map((m: MedItem) => ({ name: m.name, dose: m.dose, time: m.time }));
        }
        if (updatedPlanDetails.aerobic) {
          delete updatedPlanDetails.aerobic.done;
        }
        if (updatedPlanDetails.bio) {
          delete updatedPlanDetails.bio.done;
        }
        if (updatedPlanDetails.bloodExams) {
          updatedPlanDetails.bloodExams = updatedPlanDetails.bloodExams.map((b: BloodExamItem) => ({ name: b.name, value: b.value }));
        }
      }

      await db.collection("plans").updateOne(
        { _id: new ObjectId(planIdStr), userId },
        {
          $set: {
            details: updatedPlanDetails,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      // Se já houver ocorrência para o dia de hoje, atualiza também a ocorrência para refletir a nova versão
      if (occurrenceIdStr) {
        await db.collection("occurrences").updateOne(
          { _id: new ObjectId(occurrenceIdStr), userId },
          {
            $set: {
              details,
              status,
              updatedAt: new Date().toISOString(),
            },
          }
        );
      }
    }
  }

  revalidatePath("/");
}

// Remove uma atividade (Só hoje [pula] vs Todos os futuros [deleta plano])
export async function deleteActivityAction(
  dateStr: string,
  planIdStr: string,
  occurrenceIdStr: string | undefined,
  scope: "today" | "all"
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  if (scope === "today") {
    // Só hoje -> cria ocorrência com status 'skipped'
    if (occurrenceIdStr) {
      await db.collection("occurrences").updateOne(
        { _id: new ObjectId(occurrenceIdStr), userId },
        {
          $set: {
            status: "skipped",
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } else {
      const plan = await db.collection("plans").findOne({ _id: new ObjectId(planIdStr), userId });
      if (plan) {
        await db.collection("occurrences").insertOne({
          userId,
          planId: new ObjectId(planIdStr),
          date: dateStr,
          type: plan.type,
          status: "skipped",
          isOverride: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } else {
    // Deleta para todos os futuros (marca plano como deletado)
    await db.collection("plans").updateOne(
      { _id: new ObjectId(planIdStr), userId },
      { $set: { isDeleted: true, updatedAt: new Date().toISOString() } }
    );

    // Opcionalmente limpa as ocorrências futuras pendentes
    await db.collection("occurrences").deleteMany({
      planId: new ObjectId(planIdStr),
      userId,
      date: { $gte: dateStr },
      status: "pending",
    });
  }

  revalidatePath("/");
}

// Conta a quantidade de atividades pendentes nos últimos 30 dias
export async function getPendingCountAction(): Promise<{ count: number; pendingDates: string[] }> {
  const { userId } = await auth();
  if (!userId) return { count: 0, pendingDates: [] };

  const db = await getDb();

  // Pega a data de hoje no fuso UTC para gerar a lista dos últimos 30 dias passados
  const today = new Date();
  const dateList: string[] = [];

  for (let i = 1; i <= 30; i++) {
    const prevDate = new Date(today);
    prevDate.setDate(today.getDate() - i);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, "0");
    const d = String(prevDate.getDate()).padStart(2, "0");
    dateList.push(`${y}-${m}-${d}`);
  }

  // Busca todos os planos ativos do usuário
  const dbPlans = await db.collection("plans")
    .find({ userId, isDeleted: { $ne: true } })
    .toArray();

  const plans = dbPlans.map((p) => ({
    ...p,
    _id: p._id.toString(),
  })) as unknown as Plan[];

  // Busca todas as ocorrências conclúidas ou puladas dos últimos 30 dias
  const dbOccurrences = await db.collection("occurrences")
    .find({ userId, date: { $in: dateList } })
    .toArray();

  const occurrences = dbOccurrences.map((o) => ({
    ...o,
    _id: o._id.toString(),
    planId: o.planId?.toString(),
  })) as unknown as Occurrence[];

  let pendingCount = 0;
  const pendingDatesMap = new Set<string>();

  for (const dateStr of dateList) {
    for (const plan of plans) {
      const { applies } = planAppliesToDate(plan, dateStr);
      if (applies) {
        const occ = occurrences.find((o) => o.planId === plan._id && o.date === dateStr);
        // Se não houver ocorrência (ficou pendente) ou se ela estiver explícita como 'pending'
        if (!occ || occ.status === "pending") {
          pendingCount++;
          pendingDatesMap.add(dateStr);
        }
      }
    }
  }

  return {
    count: pendingCount,
    pendingDates: Array.from(pendingDatesMap).sort(),
  };
}
