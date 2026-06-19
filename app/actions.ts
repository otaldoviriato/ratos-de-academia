"use server";

import clientPromise from "../lib/db";
import { ObjectId } from "mongodb";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { openai } from "../lib/openai";

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

export type ProjectMeasurement = {
  date: string; // "YYYY-MM-DD"
  weight: number;
  fatPct?: number;
  muscleMass?: number;
};

export type ProjectGoalType = "emagrecimento" | "ganho_massa" | "manutencao" | "outros";
export type ProjectMeasurementFrequency = "daily" | "weekly" | "fortnightly" | "monthly";

export type Project = {
  _id?: string;
  userId: string;
  title: string;
  goalType: ProjectGoalType;
  durationDays: number;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  measurementFrequency: ProjectMeasurementFrequency;
  metricType: "weight" | "composition";
  initialMetrics: {
    weight: number;
    fatPct?: number;
    muscleMass?: number;
  };
  targetMetrics: {
    weight: number;
    fatPct?: number;
    muscleMass?: number;
  };
  measurements: ProjectMeasurement[];
  status: "active" | "completed" | "cancelled";
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
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

  // Busca projeto ativo do usuário para injetar tarefa de medição periódica
  const project = await db.collection("projects").findOne({
    userId,
    isDeleted: { $ne: true },
    status: "active"
  }) as unknown as Project | null;

  let hasActiveProjectMeasurementDay = false;

  if (project) {
    const [y1, m1, d1] = project.startDate.split("-").map(Number);
    const [y2, m2, d2] = dateStr.split("-").map(Number);
    const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
    const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
    const diffTime = date2.getTime() - date1.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= project.durationDays) {
      let isMeasurementDay = false;
      switch (project.measurementFrequency) {
        case "daily":
          isMeasurementDay = true;
          break;
        case "weekly":
          isMeasurementDay = diffDays % 7 === 0;
          break;
        case "fortnightly":
          isMeasurementDay = diffDays % 15 === 0;
          break;
        case "monthly":
          isMeasurementDay = diffDays % 30 === 0;
          break;
      }

      if (isMeasurementDay) {
        hasActiveProjectMeasurementDay = true;
        // Verifica se há ocorrência de bioimpedância para este dia
        const occurrence = occurrences.find((o) => o.type === "bioimpedancia" && !o.planId);
        
        let status: "pending" | "done" | "skipped" = "pending";
        let details: PlanDetails = { bio: {} };

        if (occurrence) {
          status = occurrence.status;
          details = occurrence.details || { bio: {} };
        } else {
          // Verifica se existe medição no projeto para a data
          const measurement = project.measurements?.find((m) => m.date === dateStr);
          if (measurement) {
            status = "done";
            details = {
              bio: {
                weight: measurement.weight,
                fatPct: measurement.fatPct,
                muscleMass: measurement.muscleMass,
                done: true
              }
            };
          }
        }

        activities.push({
          id: occurrence?._id || `project-measurement-${project._id}-${dateStr}`,
          occurrenceId: occurrence?._id,
          type: "bioimpedancia",
          title: project.metricType === "composition" ? "Medição de Composição" : "Medição de Peso",
          tag: "Projeto",
          done: status === "done",
          status,
          details,
        });
      }
    }
  }

  // Busca ocorrências avulsas (sem planId) criadas para esse dia
  const extraOccurrences = occurrences.filter((o) => {
    if (!o.planId) {
      // Evita duplicar se for a medição de bioimpedância do projeto
      if (o.type === "bioimpedancia" && hasActiveProjectMeasurementDay) {
        return false;
      }
      return true;
    }
    return false;
  });

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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const mealOrderRules = [
  ["cafe da manha", "desjejum"],
  ["lanche da manha", "colacao"],
  ["almoco"],
  ["pre treino", "pre-treino"],
  ["lanche da tarde", "cafe da tarde"],
  ["pos treino", "pos-treino"],
  ["jantar"],
  ["ceia"]
];

function getMealOrderIndex(name: string) {
  const normalized = normalizeText(name || "");
  const index = mealOrderRules.findIndex((aliases) =>
    aliases.some((alias) => normalized.includes(alias))
  );
  return index === -1 ? mealOrderRules.length : index;
}

function sortMeals<T extends { name?: string }>(meals: T[] = []) {
  return [...meals].sort((a, b) => {
    const orderDiff = getMealOrderIndex(a?.name || "") - getMealOrderIndex(b?.name || "");
    return orderDiff || String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR");
  });
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
  
  if (type === "bioimpedancia") {
    const activeProject = await db.collection("projects").findOne({
      userId,
      status: "active",
      isDeleted: { $ne: true }
    });
    if (activeProject) {
      const newDone = !currentDone;
      if (newDone) {
        const profile = await db.collection("profiles").findOne({ userId });
        const weight = profile?.biometrics?.weight || 70;
        const fatPct = profile?.biometrics?.fatPct;
        const muscleMass = profile?.biometrics?.muscleMass;
        await addProjectMeasurementAction(activeProject._id.toString(), {
          date: dateStr,
          weight,
          fatPct,
          muscleMass
        });
      } else {
        await deleteProjectMeasurementAction(activeProject._id.toString(), dateStr);
      }
      revalidatePath("/");
      return;
    }
  }

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

  if (type === "bioimpedancia") {
    const activeProject = await db.collection("projects").findOne({
      userId,
      status: "active",
      isDeleted: { $ne: true }
    });
    if (activeProject) {
      if (forcedStatus === "skipped") {
        await deleteProjectMeasurementAction(activeProject._id.toString(), dateStr);
        if (occurrenceIdStr) {
          await db.collection("occurrences").updateOne(
            { _id: new ObjectId(occurrenceIdStr), userId },
            { $set: { status: "skipped", details, updatedAt: new Date().toISOString() } }
          );
        } else {
          await db.collection("occurrences").insertOne({
            userId,
            date: dateStr,
            type: "bioimpedancia",
            status: "skipped",
            isOverride: true,
            details,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        if (details.bio?.weight) {
          await addProjectMeasurementAction(activeProject._id.toString(), {
            date: dateStr,
            weight: Number(details.bio.weight),
            fatPct: details.bio.fatPct !== undefined ? Number(details.bio.fatPct) : undefined,
            muscleMass: details.bio.muscleMass !== undefined ? Number(details.bio.muscleMass) : undefined
          });
        } else {
          await deleteProjectMeasurementAction(activeProject._id.toString(), dateStr);
        }
      }
      revalidatePath("/");
      return;
    }
  }

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
  trainingTime?: string;
  experience?: "iniciante" | "intermediario" | "avancado";
  goal?: "bulking" | "cutting" | "manutencao" | "hipertrofia" | "emagrecimento" | "saude";
  trainingDaysPerWeek?: number;
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

// Reinicia o onboarding do zero sem apagar a rotina ativa até o usuário salvar a nova.
export async function resetOnboardingAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        isOnboarded: false,
        updatedAt: new Date().toISOString()
      },
      $unset: {
        onboardingState: ""
      }
    }
  );

  revalidatePath("/");
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
        trainingTime: profileData.trainingTime,
        experience: profileData.experience,
        goal: profileData.goal,
        trainingDaysPerWeek: profileData.trainingDaysPerWeek ? Number(profileData.trainingDaysPerWeek) : undefined,
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
      details: plan.type === "dieta" && plan.details?.meals
        ? { ...plan.details, meals: sortMeals(plan.details.meals) }
        : plan.details,
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
      trainingTime: profile.trainingTime,
      experience: profile.experience,
      goal: profile.goal,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
    },
    biometrics: profile.biometrics || {},
    diet: [],
    workouts: {},
    aerobic: {},
  };

  dbPlans.forEach((plan) => {
    if (plan.type === "dieta") {
      previewData.diet = sortMeals(plan.details.meals || (plan.details.dietItems ? [{ name: "Refeições", items: plan.details.dietItems }] : []));
    } else if (plan.type === "musculacao" && plan.details?.workouts) {
      previewData.workouts = plan.details.workouts;
    } else if (plan.type === "aerobico" && plan.details?.aerobic) {
      previewData.aerobic = plan.details.aerobic;
    }
  });

  // 4. Cria a conversa inicial de ajuste
  const messages = [
    {
      role: "assistant" as const,
      content: "Olá! Notei que você quer fazer alguns ajustes na sua rotina atual. O que você gostaria de mudar? Pode me dizer se quer alterar algum exercício ou ajustar refeições da dieta.",
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
      trainingTime: profile.trainingTime,
      experience: profile.experience,
      goal: profile.goal,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
    },
    biometrics: profile.biometrics || {},
    diet: [],
    workouts: {},
    aerobic: {},
  };

  dbPlans.forEach((plan) => {
    if (plan.type === "dieta") {
      previewData.diet = sortMeals(plan.details.meals || (plan.details.dietItems ? [{ name: "Refeições", items: plan.details.dietItems }] : []));
    } else if (plan.type === "musculacao" && plan.details?.workouts) {
      previewData.workouts = plan.details.workouts;
    } else if (plan.type === "aerobico" && plan.details?.aerobic) {
      previewData.aerobic = plan.details.aerobic;
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

// Estima calorias de dieta ou aeróbico utilizando IA (gpt-4o-mini)
export async function estimateCaloriesAction(text: string, type: "dieta" | "aerobico"): Promise<number> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const prompt = type === "dieta"
    ? `Você é um nutricionista esportivo. Estime a quantidade total de calorias (kcal) para a seguinte descrição de alimento: "${text}".
Responda APENAS com um número inteiro representando as calorias (kcal), sem texto adicional, unidades ou explicações.`
    : `Você é um treinador físico. Estime a quantidade total de calorias (kcal) gastas para a seguinte descrição de atividade física/cardio: "${text}".
Responda APENAS com um número inteiro representando as calorias (kcal), sem texto adicional, unidades ou explicações.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    });

    const content = response.choices[0]?.message?.content?.trim();
    const calories = parseInt(content || "0", 10);
    return isNaN(calories) ? 0 : calories;
  } catch (err) {
    console.error("Erro na estimativa de calorias por IA:", err);
    return 0;
  }
}

// Desmembra e estima valor calórico de um alimento em uma única frase usando IA (gpt-4o-mini)
export async function parseFoodInputWithAIAction(text: string): Promise<{ name: string; amount: string; calories: number }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const prompt = `Você é um assistente de nutrição esportiva. O usuário digitou a seguinte descrição de alimento: "${text}".
Sua tarefa é desmembrar essa descrição e estimar o valor calórico total.
Retorne APENAS um JSON no formato:
{
  "name": "nome do alimento de forma resumida e limpa (ex: Frango grelhado)",
  "amount": "a quantidade e peso da comida formatados de forma limpa (ex: 150g)",
  "calories": calorias em número inteiro (ex: 165)
}
Não retorne blocos de código markdown (\`\`\`json ... \`\`\`), explicações ou qualquer texto adicional. Apenas o objeto JSON válido.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    const cleanJsonStr = content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const data = JSON.parse(cleanJsonStr);
    
    return {
      name: String(data.name || text),
      amount: String(data.amount || "1 porção"),
      calories: Number(data.calories) || 0
    };
  } catch (err) {
    console.error("Erro ao processar alimento com IA:", err);
    return {
      name: text,
      amount: "1 porção",
      calories: 0
    };
  }
}

function getLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ==========================================
// AÇÕES DE PROJETOS DE OBJETIVOS FÍSICOS
// ==========================================

export async function getActiveProjectAction(): Promise<Project | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const db = await getDb();
  const project = await db.collection("projects").findOne({
    userId,
    isDeleted: { $ne: true },
    status: "active"
  });

  if (!project) return null;

  return {
    ...project,
    _id: project._id.toString()
  } as unknown as Project;
}

export async function createProjectAction(data: {
  title: string;
  goalType: ProjectGoalType;
  durationDays: number;
  measurementFrequency: ProjectMeasurementFrequency;
  metricType: "weight" | "composition";
  initialMetrics: {
    weight: number;
    fatPct?: number;
    muscleMass?: number;
  };
  targetMetrics: {
    weight: number;
    fatPct?: number;
    muscleMass?: number;
  };
}): Promise<{ success: boolean; projectId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();

  // 1. Arquivar projetos ativos anteriores
  await db.collection("projects").updateMany(
    { userId, status: "active", isDeleted: { $ne: true } },
    { $set: { status: "cancelled", updatedAt: new Date().toISOString() } }
  );

  const startDateObj = new Date();
  const startDateStr = getLocalDateStr(startDateObj);
  
  const endDateObj = new Date();
  endDateObj.setDate(endDateObj.getDate() + data.durationDays);
  const endDateStr = getLocalDateStr(endDateObj);

  const newProject: Project = {
    userId,
    title: data.title,
    goalType: data.goalType,
    durationDays: data.durationDays,
    startDate: startDateStr,
    endDate: endDateStr,
    measurementFrequency: data.measurementFrequency,
    metricType: data.metricType,
    initialMetrics: data.initialMetrics,
    targetMetrics: data.targetMetrics,
    measurements: [
      {
        date: startDateStr,
        weight: data.initialMetrics.weight,
        fatPct: data.initialMetrics.fatPct,
        muscleMass: data.initialMetrics.muscleMass
      }
    ],
    status: "active",
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const result = await db.collection("projects").insertOne(newProject as any);
  
  // Atualizar a biometria no perfil do usuário para consistência
  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        "biometrics.weight": data.initialMetrics.weight,
        ...(data.initialMetrics.fatPct !== undefined ? { "biometrics.fatPct": data.initialMetrics.fatPct } : {}),
        ...(data.initialMetrics.muscleMass !== undefined ? { "biometrics.muscleMass": data.initialMetrics.muscleMass } : {}),
        updatedAt: new Date().toISOString()
      }
    }
  );

  revalidatePath("/");
  return { success: true, projectId: result.insertedId.toString() };
}

export async function deleteProjectAction(projectId: string): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();
  await db.collection("projects").updateOne(
    { _id: new ObjectId(projectId), userId },
    { $set: { isDeleted: true, status: "cancelled", updatedAt: new Date().toISOString() } }
  );

  revalidatePath("/");
  return { success: true };
}

export async function addProjectMeasurementAction(
  projectId: string,
  measurement: {
    date: string;
    weight: number;
    fatPct?: number;
    muscleMass?: number;
  }
): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();
  
  // Garante que a medição não seja duplicada para a mesma data (se já existir, atualiza ela)
  const project = await db.collection("projects").findOne({ _id: new ObjectId(projectId), userId });
  if (!project) throw new Error("Projeto não encontrado");

  const existingMeasurements: ProjectMeasurement[] = project.measurements || [];
  const idx = existingMeasurements.findIndex(m => m.date === measurement.date);
  
  if (idx >= 0) {
    existingMeasurements[idx] = {
      date: measurement.date,
      weight: Number(measurement.weight),
      ...(measurement.fatPct !== undefined ? { fatPct: Number(measurement.fatPct) } : {}),
      ...(measurement.muscleMass !== undefined ? { muscleMass: Number(measurement.muscleMass) } : {})
    };
  } else {
    existingMeasurements.push({
      date: measurement.date,
      weight: Number(measurement.weight),
      ...(measurement.fatPct !== undefined ? { fatPct: Number(measurement.fatPct) } : {}),
      ...(measurement.muscleMass !== undefined ? { muscleMass: Number(measurement.muscleMass) } : {})
    });
    // Ordena as medições por data
    existingMeasurements.sort((a, b) => a.date.localeCompare(b.date));
  }

  await db.collection("projects").updateOne(
    { _id: new ObjectId(projectId), userId },
    {
      $set: {
        measurements: existingMeasurements,
        updatedAt: new Date().toISOString()
      }
    }
  );

  // Também registra essa medição como uma biometria na ocorrência do dia para alimentar os gráficos gerais do app
  // E atualiza o perfil do usuário
  await db.collection("profiles").updateOne(
    { userId },
    {
      $set: {
        "biometrics.weight": Number(measurement.weight),
        ...(measurement.fatPct !== undefined ? { "biometrics.fatPct": Number(measurement.fatPct) } : {}),
        ...(measurement.muscleMass !== undefined ? { "biometrics.muscleMass": Number(measurement.muscleMass) } : {}),
        updatedAt: new Date().toISOString()
      }
    }
  );

  // Tenta achar se já tem ocorrência de bioimpedância no dia, ou insere
  const startDayStr = measurement.date;
  const bioOcc = await db.collection("occurrences").findOne({
    userId,
    date: startDayStr,
    type: "bioimpedancia"
  });

  if (bioOcc) {
    await db.collection("occurrences").updateOne(
      { _id: bioOcc._id },
      {
        $set: {
          status: "done",
          details: {
            bio: {
              weight: Number(measurement.weight),
              fatPct: measurement.fatPct !== undefined ? Number(measurement.fatPct) : undefined,
              muscleMass: measurement.muscleMass !== undefined ? Number(measurement.muscleMass) : undefined,
              done: true
            }
          },
          updatedAt: new Date().toISOString()
        }
      }
    );
  } else {
    // Busca se existe algum plano de bioimpedância para linkar, senão cria ocorrência avulsa (override)
    const activeBioPlan = await db.collection("plans").findOne({
      userId,
      type: "bioimpedancia",
      isDeleted: { $ne: true }
    });

    await db.collection("occurrences").insertOne({
      userId,
      planId: activeBioPlan?._id.toString() || undefined,
      date: startDayStr,
      type: "bioimpedancia",
      status: "done",
      isOverride: !activeBioPlan,
      details: {
        bio: {
          weight: Number(measurement.weight),
          fatPct: measurement.fatPct !== undefined ? Number(measurement.fatPct) : undefined,
          muscleMass: measurement.muscleMass !== undefined ? Number(measurement.muscleMass) : undefined,
          done: true
        }
      },
      updatedAt: new Date().toISOString()
    });
  }

  revalidatePath("/");
  return { success: true };
}

export async function deleteProjectMeasurementAction(projectId: string, date: string): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  const db = await getDb();
  const project = await db.collection("projects").findOne({ _id: new ObjectId(projectId), userId });
  if (!project) throw new Error("Projeto não encontrado");

  const measurements: ProjectMeasurement[] = project.measurements || [];
  const filtered = measurements.filter(m => m.date !== date);

  await db.collection("projects").updateOne(
    { _id: new ObjectId(projectId), userId },
    {
      $set: {
        measurements: filtered,
        updatedAt: new Date().toISOString()
      }
    }
  );

  // Também deleta a ocorrência de bioimpedância correspondente daquela data específica se ela foi criada a partir daqui
  // Para manter os gráficos de estatísticas gerais sintonizados
  await db.collection("occurrences").deleteOne({
    userId,
    date,
    type: "bioimpedancia",
    isOverride: true // Apenas se for ocorrência criada avulsa
  });

  revalidatePath("/");
  return { success: true };
}

export async function parseCompositionTextWithAIAction(text: string): Promise<{
  weight?: number;
  fatPct?: number;
  muscleMass?: number;
}> {
  const { userId } = await auth();
  if (!userId) throw new Error("Não autorizado");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um assistente especialista que extrai dados biométricos de descrições textuais em português.
Extraia os seguintes valores com precisão:
1. "weight": peso corporal em kg.
2. "fatPct": percentual de gordura em %.
3. "muscleMass": massa muscular em kg.

Retorne obrigatoriamente um objeto JSON contendo exatamente as chaves: "weight", "fatPct" e "muscleMass".
Se algum dado não for encontrado de forma clara na descrição, defina o valor da respectiva chave como null.
Retorne apenas o JSON puro, sem blocos de código markdown.`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.1
    });

    const contentText = response.choices[0].message?.content || "{}";
    const parsed = JSON.parse(contentText);
    return {
      weight: parsed.weight !== null ? Number(parsed.weight) : undefined,
      fatPct: parsed.fatPct !== null ? Number(parsed.fatPct) : undefined,
      muscleMass: parsed.muscleMass !== null ? Number(parsed.muscleMass) : undefined
    };
  } catch (err) {
    console.error("Erro ao processar texto de composição:", err);
    return {};
  }
}

// Retorna as atividades de múltiplos dias específicos de uma só vez (otimização de banco de dados/rede)
export async function getDaysActivities(dateStrings: string[]): Promise<Record<string, ActivityItem[]>> {
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

  // Busca ocorrências para as datas solicitadas
  const dbOccurrences = await db.collection("occurrences")
    .find({ userId, date: { $in: dateStrings } })
    .toArray();

  const occurrences = dbOccurrences.map((o) => ({
    ...o,
    _id: o._id.toString(),
    planId: o.planId?.toString(),
  })) as unknown as Occurrence[];

  const project = await db.collection("projects").findOne({
    userId,
    isDeleted: { $ne: true },
    status: "active"
  }) as unknown as Project | null;

  const result: Record<string, ActivityItem[]> = {};

  for (const dateStr of dateStrings) {
    const activities: ActivityItem[] = [];
    const dailyOccurrences = occurrences.filter((o) => o.date === dateStr);

    for (const plan of plans) {
      const { applies, routineLetter } = planAppliesToDate(plan, dateStr);

      if (applies) {
        const occurrence = dailyOccurrences.find((o) => o.planId === plan._id);

        let status: "pending" | "done" | "skipped" = "pending";
        let details: PlanDetails = JSON.parse(JSON.stringify(plan.details));

        if (plan.type === "musculacao" && routineLetter) {
          details.routine = routineLetter;
          if (details.workouts && details.workouts[routineLetter]) {
            const originalExercises = details.workouts[routineLetter];
            details.workouts = {
              [routineLetter]: originalExercises.map(ex => ({ ...ex, done: ex.done !== undefined ? ex.done : undefined }))
            };
          }
        }

        if (occurrence) {
          status = occurrence.status;
          if (occurrence.isOverride && occurrence.details) {
            details = JSON.parse(JSON.stringify(occurrence.details));
          } else if (occurrence.status === "done") {
            if (occurrence.details) {
              details = JSON.parse(JSON.stringify(occurrence.details));
            } else {
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

    if (project) {
      const [y1, m1, d1] = project.startDate.split("-").map(Number);
      const [y2, m2, d2] = dateStr.split("-").map(Number);
      const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
      const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
      const diffTime = date2.getTime() - date1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= project.durationDays) {
        let isMeasurementDay = false;
        switch (project.measurementFrequency) {
          case "daily":
            isMeasurementDay = true;
            break;
          case "weekly":
            isMeasurementDay = diffDays % 7 === 0;
            break;
          case "fortnightly":
            isMeasurementDay = diffDays % 15 === 0;
            break;
          case "monthly":
            isMeasurementDay = diffDays % 30 === 0;
            break;
        }

        if (isMeasurementDay) {
          const occurrence = dailyOccurrences.find((o) => o.type === "bioimpedancia" && !o.planId);
          let status: "pending" | "done" | "skipped" = "pending";
          let details: PlanDetails = { bio: {} };

          if (occurrence) {
            status = occurrence.status;
            details = occurrence.details || { bio: {} };
          } else {
            const measurement = project.measurements?.find((m) => m.date === dateStr);
            if (measurement) {
              status = "done";
              details = {
                bio: {
                  weight: measurement.weight,
                  fatPct: measurement.fatPct,
                  muscleMass: measurement.muscleMass,
                  done: true
                }
              };
            }
          }

          activities.push({
            id: occurrence?._id || `project-measurement-${project._id}-${dateStr}`,
            occurrenceId: occurrence?._id,
            type: "bioimpedancia",
            title: project.metricType === "composition" ? "Medição de Composição" : "Medição de Peso",
            tag: "Projeto",
            done: status === "done",
            status,
            details,
          });
        }
      }
    }

    result[dateStr] = activities;
  }

  return result;
}

