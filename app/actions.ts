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

export type MealItem = {
  name: string;
  calories: number;
  amount: string;
  done?: boolean;
};

export type Meal = {
  name: string;
  items: MealItem[];
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
  meals?: Meal[];
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
          // Criamos a lista preservando o estado 'done' (que pode ser undefined)
          details.workouts = {
            [routineLetter]: originalExercises.map(ex => ({ ...ex, done: ex.done !== undefined ? ex.done : undefined }))
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
  } else if (type === "dieta") {
    if (res.meals) {
      res.meals = res.meals.map((meal: Meal) => ({
        ...meal,
        items: meal.items.map((item: MealItem) => ({ ...item, done: true }))
      }));
    } else if (res.dietItems) {
      res.dietItems = res.dietItems.map((e: DietItem) => ({ ...e, done: true }));
    }
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
    res.workouts[routineLetter] = res.workouts[routineLetter].map((e: WorkoutExercise) => {
      const { done, ...rest } = e;
      return rest;
    });
  } else if (type === "dieta") {
    if (res.meals) {
      res.meals = res.meals.map((meal: Meal) => ({
        ...meal,
        items: meal.items.map((item: MealItem) => {
          const { done, ...rest } = item;
          return rest;
        })
      }));
    } else if (res.dietItems) {
      res.dietItems = res.dietItems.map((e: DietItem) => {
        const { done, ...rest } = e;
        return rest;
      });
    }
  } else if (type === "medicamento" && res.meds) {
    res.meds = res.meds.map((e: MedItem) => {
      const { done, ...rest } = e;
      return rest;
    });
  } else if (type === "aerobico" && res.aerobic) {
    delete res.aerobic.done;
  } else if (type === "bioimpedancia" && res.bio) {
    delete res.bio.done;
  } else if (type === "sangue" && res.bloodExams) {
    res.bloodExams = res.bloodExams.map((e: BloodExamItem) => {
      const { done, ...rest } = e;
      return rest;
    });
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
  type: PlanType,
  forcedStatus?: "done" | "skipped"
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // Calcula se a atividade deve ser considerada feita globalmente
  let status: "pending" | "done" | "skipped" = "pending";
  if (forcedStatus) {
    status = forcedStatus;
  } else if (type === "musculacao" && details.routine && details.workouts && details.workouts[details.routine]) {
    const list = details.workouts[details.routine];
    const hasDone = list.some(e => e.done === true);
    const allSkipped = list.length > 0 && list.every(e => e.done === false);
    status = hasDone ? "done" : (allSkipped ? "skipped" : "pending");
  } else if (type === "dieta") {
    if (details.meals) {
      const allItems = details.meals.flatMap((m: Meal) => m.items || []);
      const hasDone = allItems.some(e => e.done === true);
      const allSkipped = allItems.length > 0 && allItems.every(e => e.done === false);
      status = hasDone ? "done" : (allSkipped ? "skipped" : "pending");
    } else if (details.dietItems) {
      const list = details.dietItems;
      const hasDone = list.some(e => e.done === true);
      const allSkipped = list.length > 0 && list.every(e => e.done === false);
      status = hasDone ? "done" : (allSkipped ? "skipped" : "pending");
    }
  } else if (type === "medicamento" && details.meds) {
    const list = details.meds;
    const hasDone = list.some(e => e.done === true);
    const allSkipped = list.length > 0 && list.every(e => e.done === false);
    status = hasDone ? "done" : (allSkipped ? "skipped" : "pending");
  } else if (type === "aerobico" && details.aerobic) {
    status = details.aerobic.done === true ? "done" : (details.aerobic.done === false ? "skipped" : "pending");
  } else if (type === "bioimpedancia" && details.bio) {
    status = details.bio.done === true ? "done" : (details.bio.done === false ? "skipped" : "pending");
  } else if (type === "sangue" && details.bloodExams) {
    const list = details.bloodExams;
    const hasDone = list.some(e => e.done === true);
    const allSkipped = list.length > 0 && list.every(e => e.done === false);
    status = hasDone ? "done" : (allSkipped ? "skipped" : "pending");
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
        if (updatedPlanDetails.meals) {
          updatedPlanDetails.meals = updatedPlanDetails.meals.map((m: Meal) => ({
            name: m.name,
            items: m.items.map((i: MealItem) => ({ name: i.name, calories: i.calories, amount: i.amount }))
          }));
        }
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

export type UserProfile = {
  _id?: string;
  userId: string;
  isOnboarded: boolean;
  gender?: "masculino" | "feminino" | "outro";
  age?: number;
  goal?: "hipertrofia" | "emagrecimento" | "saude";
  biometrics?: {
    height?: number; // em cm
    weight?: number; // em kg
    fatPct?: number; // em %
    muscleMass?: number; // em kg
    tmb?: number; // em kcal
  };
  onboardingState?: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    previewData: any;
    finished?: boolean;
    isAdjustment?: boolean;
    updatedAt: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

// Busca o perfil do usuário
export async function getUserProfileAction(): Promise<UserProfile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const db = await getDb();
  const profile = await db.collection("profiles").findOne({ userId });
  if (!profile) return null;

  return {
    ...profile,
    _id: profile._id.toString(),
  } as unknown as UserProfile;
}

// Salva o progresso temporário do onboarding (mensagens e previewData)
export async function saveOnboardingProgressAction(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  previewData: any,
  finished: boolean = false
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // Verifica se o usuário já concluiu o onboarding anteriormente
  const profile = await db.collection("profiles").findOne({ userId });
  const wasOnboarded = profile ? profile.isOnboarded === true : false;

  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        userId,
        isOnboarded: wasOnboarded ? true : false,
        onboardingState: {
          messages,
          previewData,
          finished,
          updatedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      },
      $setOnInsert: {
        createdAt: new Date().toISOString()
      }
    },
    { upsert: true }
  );
}

// Cancela o ajuste do onboarding limpando o estado de conversa temporária e reativando isOnboarded
export async function cancelOnboardingAdjustmentAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        isOnboarded: true,
        updatedAt: new Date().toISOString()
      },
      $unset: {
        onboardingState: ""
      }
    }
  );
}


// Conclui o onboarding salvando o perfil e os planos associados no banco de dados
export async function completeOnboardingAction(
  profileData: Omit<UserProfile, "userId" | "isOnboarded">,
  plans: Omit<Plan, "userId" | "_id">[]
): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // 1. Cria ou atualiza o perfil do usuário
  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        userId,
        isOnboarded: true,
        gender: profileData.gender,
        age: Number(profileData.age),
        goal: profileData.goal,
        biometrics: profileData.biometrics ? {
          height: profileData.biometrics.height ? Number(profileData.biometrics.height) : undefined,
          weight: profileData.biometrics.weight ? Number(profileData.biometrics.weight) : undefined,
          fatPct: profileData.biometrics.fatPct ? Number(profileData.biometrics.fatPct) : undefined,
          muscleMass: profileData.biometrics.muscleMass ? Number(profileData.biometrics.muscleMass) : undefined,
          tmb: profileData.biometrics.tmb ? Number(profileData.biometrics.tmb) : undefined,
        } : undefined,
        updatedAt: new Date().toISOString(),
      },
      $unset: {
        onboardingState: ""
      }
    },
    { upsert: true }
  );

  // 2. Efetua soft-delete de todos os planos ativos anteriores do usuário para evitar duplicação
  await db.collection("plans").updateMany(
    { userId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, updatedAt: new Date().toISOString() } }
  );

  // 3. Insere os novos planos criados no onboarding/ajuste (se houver)
  if (plans && plans.length > 0) {
    const plansToInsert = plans.map((plan) => ({
      ...plan,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await db.collection("plans").insertMany(plansToInsert);
  }

  revalidatePath("/");
  return { success: true };
}

// Carrega a rotina atual e o perfil do usuário para reabrir o onboarding em modo de Ajustes
export async function getOnboardingAdjustmentDataAction(): Promise<UserProfile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const db = await getDb();

  // 1. Busca o perfil do usuário
  const profile = await db.collection("profiles").findOne({ userId });
  if (!profile) return null;

  // 2. Busca todos os planos ativos daquele usuário
  const dbPlans = await db.collection("plans")
    .find({ userId, isDeleted: { $ne: true } })
    .toArray();

  // 3. Monta o previewData de forma compatível
  const previewData: any = {
    profile: {
      gender: profile.gender,
      age: profile.age,
      goal: profile.goal,
    },
    biometrics: profile.biometrics || {},
    diet: [],
    workouts: {},
    aerobic: {},
    meds: [],
  };

  dbPlans.forEach((plan) => {
    if (plan.type === "dieta") {
      previewData.diet = plan.details.meals || (plan.details.dietItems ? [{ name: "Refeições", items: plan.details.dietItems }] : []);
    } else if (plan.type === "musculacao" && plan.details?.workouts) {
      previewData.workouts = plan.details.workouts;
    } else if (plan.type === "aerobico" && plan.details?.aerobic) {
      previewData.aerobic = plan.details.aerobic;
    } else if (plan.type === "medicamento" && plan.details?.meds) {
      // Reconstrói o medicamento incluindo a frequência dele no item
      const medsList = plan.details.meds.map((m: any) => ({
        ...m,
        frequency: plan.frequency,
      }));
      previewData.meds = [...previewData.meds, ...medsList];
    }
  });

  // 4. Cria a conversa inicial de ajuste
  const messages = [
    {
      role: "assistant" as const,
      content: "Olá! Notei que você quer fazer alguns ajustes na sua rotina atual. O que você gostaria de mudar? Pode me dizer se quer alterar algum exercício, ajustar refeições da dieta ou mudar horários/recorrências de medicamentos.",
    },
  ];

  // Retorna um UserProfile fictício com o onboardingState injetado
  return {
    ...profile,
    _id: profile._id.toString(),
    isOnboarded: false, // Força a exibição temporária da tela de onboarding no frontend
    onboardingState: {
      messages,
      previewData,
      finished: false,
      isAdjustment: true,
      updatedAt: new Date().toISOString(),
    },
  } as unknown as UserProfile;
}

// Carrega o previewData da rotina ativa do usuário
export async function getUserRoutineAction(): Promise<any> {
  const { userId } = await auth();
  if (!userId) return null;

  const db = await getDb();

  // 1. Busca o perfil do usuário
  const profile = await db.collection("profiles").findOne({ userId });
  if (!profile) return null;

  // 2. Busca todos os planos ativos daquele usuário
  const dbPlans = await db.collection("plans")
    .find({ userId, isDeleted: { $ne: true } })
    .toArray();

  // 3. Monta o previewData de forma compatível
  const previewData: any = {
    profile: {
      gender: profile.gender,
      age: profile.age,
      goal: profile.goal,
    },
    biometrics: profile.biometrics || {},
    diet: [],
    workouts: {},
    aerobic: {},
    meds: [],
  };

  dbPlans.forEach((plan) => {
    if (plan.type === "dieta") {
      previewData.diet = plan.details.meals || (plan.details.dietItems ? [{ name: "Refeições", items: plan.details.dietItems }] : []);
    } else if (plan.type === "musculacao" && plan.details?.workouts) {
      previewData.workouts = plan.details.workouts;
    } else if (plan.type === "aerobico" && plan.details?.aerobic) {
      previewData.aerobic = plan.details.aerobic;
    } else if (plan.type === "medicamento" && plan.details?.meds) {
      const medsList = plan.details.meds.map((m: any) => ({
        ...m,
        frequency: plan.frequency,
      }));
      previewData.meds = [...previewData.meds, ...medsList];
    }
  });

  return previewData;
}

// Carrega o histórico completo de ocorrências concluídas para renderizar estatísticas
export async function getStatisticsDataAction(): Promise<{
  diet: Array<{ date: string; value: number }>;
  workouts: { [exerciseName: string]: Array<{ date: string; loadStr: string; loadVal: number }> };
  aerobics: { [cardioName: string]: Array<{ date: string; duration: number }> };
  exams: { [examName: string]: Array<{ date: string; valStr: string; valNum: number }> };
  biometrics: {
    weight: Array<{ date: string; value: number }>;
    fatPct: Array<{ date: string; value: number }>;
    muscleMass: Array<{ date: string; value: number }>;
  };
}> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // Busca todas as ocorrências concluídas do usuário ordenadas por data
  const occurrences = await db.collection("occurrences")
    .find({ userId, status: "done" })
    .sort({ date: 1 })
    .toArray();

  const data: any = {
    diet: [],
    workouts: {},
    aerobics: {},
    exams: {},
    biometrics: {
      weight: [],
      fatPct: [],
      muscleMass: [],
    }
  };

  occurrences.forEach((occ) => {
    const dateStr = occ.date;
    const details = occ.details || {};

    // 1. Dieta (Ingestão calórica)
    if (occ.type === "dieta") {
      let totalCalories = 0;
      if (details.meals) {
        const allItems = details.meals.flatMap((m: Meal) => m.items || []);
        totalCalories = allItems.reduce((acc: number, item: any) => {
          if (item.done !== false) {
            return acc + (Number(item.calories) || 0);
          }
          return acc;
        }, 0);
      } else if (details.dietItems) {
        totalCalories = details.dietItems.reduce((acc: number, item: any) => {
          if (item.done !== false) {
            return acc + (Number(item.calories) || 0);
          }
          return acc;
        }, 0);
      }
      
      if (totalCalories > 0) {
        data.diet.push({ date: dateStr, value: totalCalories });
      }
    }

    // 2. Musculação (Treinos)
    if (occ.type === "musculacao" && details.workouts) {
      Object.keys(details.workouts).forEach((letter) => {
        const exercises = details.workouts[letter] || [];
        exercises.forEach((ex: any) => {
          if (ex.done !== false && ex.load) {
            const loadClean = ex.load.replace(/[^0-9.,]/g, '').replace(',', '.');
            const loadVal = parseFloat(loadClean);
            if (!isNaN(loadVal)) {
              if (!data.workouts[ex.name]) {
                data.workouts[ex.name] = [];
              }
              data.workouts[ex.name].push({
                date: dateStr,
                loadStr: ex.load,
                loadVal: loadVal
              });
            }
          }
        });
      });
    }

    // 3. Aeróbico (Cardio)
    if (occ.type === "aerobico" && details.aerobic) {
      const a = details.aerobic;
      if (a.done !== false && a.duration) {
        const name = a.name || "Geral";
        if (!data.aerobics[name]) {
          data.aerobics[name] = [];
        }
        data.aerobics[name].push({
          date: dateStr,
          duration: Number(a.duration)
        });
      }
    }

    // 4. Exames de Sangue
    if (occ.type === "sangue" && details.bloodExams) {
      details.bloodExams.forEach((exam: any) => {
        if (exam.done !== false && exam.value) {
          const valClean = exam.value.replace(/[^0-9.,]/g, '').replace(',', '.');
          const valNum = parseFloat(valClean);
          if (!isNaN(valNum)) {
            if (!data.exams[exam.name]) {
              data.exams[exam.name] = [];
            }
            data.exams[exam.name].push({
              date: dateStr,
              valStr: exam.value,
              valNum: valNum
            });
          }
        }
      });
    }

    // 5. Bioimpedância (Condicionamento)
    if (occ.type === "bioimpedancia" && details.bio) {
      const b = details.bio;
      if (b.done !== false) {
        if (b.weight) {
          data.biometrics.weight.push({ date: dateStr, value: Number(b.weight) });
        }
        if (b.fatPct) {
          data.biometrics.fatPct.push({ date: dateStr, value: Number(b.fatPct) });
        }
        if (b.muscleMass) {
          data.biometrics.muscleMass.push({ date: dateStr, value: Number(b.muscleMass) });
        }
      }
    }
  });

  return data;
}


