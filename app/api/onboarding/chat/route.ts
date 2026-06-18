import { auth } from "@clerk/nextjs/server";
import { openai } from "../../../../lib/openai";
import { NextResponse } from "next/server";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OnboardingResponse = {
  message?: string;
  previewData?: any;
  finished?: boolean;
};

type WorkoutExercise = {
  name: string;
  series: number;
  reps: number;
  load: string;
};

type WorkoutTemplate = {
  label: string;
  exercises: WorkoutExercise[];
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function conversationText(messages: ChatMessage[]) {
  return messages.map((message) => message.content || "").join("\n");
}

function lastUserText(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content || "";
  }
  return "";
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

function sortDietMeals(diet: any) {
  if (!Array.isArray(diet)) return diet;
  return [...diet].sort((a, b) => {
    const orderDiff = getMealOrderIndex(a?.name) - getMealOrderIndex(b?.name);
    return orderDiff || String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR");
  });
}

function mergePreviewData(prev: any, next: any) {
  return {
    ...(prev || {}),
    ...(next || {}),
    profile: {
      ...(prev?.profile || {}),
      ...(next?.profile || {})
    },
    biometrics: {
      ...(prev?.biometrics || {}),
      ...(next?.biometrics || {})
    }
  };
}

function inferExperience(previewData: any, messages: ChatMessage[]) {
  const explicit = normalizeText(previewData?.profile?.experience || "");
  if (explicit.includes("avanc")) return "avancado";
  if (explicit.includes("intermedi")) return "intermediario";
  if (explicit.includes("inic")) return "iniciante";

  const trainingTime = normalizeText(previewData?.profile?.trainingTime || "");
  const parsedFromPreview = inferExperienceFromTrainingTime(trainingTime);
  if (parsedFromPreview) return parsedFromPreview;

  const text = normalizeText(conversationText(messages));
  const parsedFromConversation = inferExperienceFromTrainingTime(text);
  if (parsedFromConversation) return parsedFromConversation;

  if (text.includes("avanc")) return "avancado";
  if (text.includes("intermedi")) return "intermediario";
  if (text.includes("inic")) return "iniciante";
  return "intermediario";
}

function inferExperienceFromTrainingTime(text: string) {
  const yearsMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(ano|anos)/);
  if (yearsMatch) {
    const years = Number(yearsMatch[1].replace(",", "."));
    if (years >= 3) return "avancado";
    if (years >= 1) return "intermediario";
    return "iniciante";
  }

  const monthsMatch = text.match(/(\d+)\s*(mes|meses)/);
  if (monthsMatch) {
    const months = Number(monthsMatch[1]);
    if (months >= 36) return "avancado";
    if (months >= 12) return "intermediario";
    return "iniciante";
  }

  return null;
}

function inferTrainingDays(previewData: any, messages: ChatMessage[]) {
  const fromPreview = Number(previewData?.profile?.trainingDaysPerWeek);
  if (Number.isFinite(fromPreview) && fromPreview >= 2 && fromPreview <= 6) {
    return Math.round(fromPreview);
  }

  const text = normalizeText(`${lastUserText(messages)}\n${conversationText(messages)}`);
  if (text.includes("abcdef")) return 6;
  if (text.includes("abcde")) return 5;
  if (text.includes("abcd")) return 4;
  if (text.includes("abc")) return 3;
  if (text.includes("ab")) return 2;

  const dayMatch = text.match(/([2-6])\s*(dias|x|vezes)/);
  if (dayMatch) return Number(dayMatch[1]);

  return 5;
}

function hasExplicitMinimalConstraint(messages: ChatMessage[]) {
  const text = normalizeText(conversationText(messages));
  return [
    "pouco tempo",
    "treino curto",
    "30 minutos",
    "20 minutos",
    "lesao",
    "dor",
    "deload",
    "retorno gradual",
    "sem equipamento",
    "equipamento limitado",
    "em casa"
  ].some((pattern) => text.includes(normalizeText(pattern)));
}

function shouldReplaceShallowWorkout(workouts: any, previewData: any, messages: ChatMessage[]) {
  if (!workouts || typeof workouts !== "object" || hasExplicitMinimalConstraint(messages)) {
    return false;
  }

  const days = Object.values(workouts).filter(Array.isArray) as any[][];
  if (days.length === 0) return false;

  const trainingDays = inferTrainingDays(previewData, messages);
  const experience = inferExperience(previewData, messages);
  const allDaysAreShallow = days.every((day) => day.length <= 3);
  const averageExercises = days.reduce((sum, day) => sum + day.length, 0) / days.length;
  const hasCardioAsWorkoutDay = days.some((day) =>
    day.some((exercise) => normalizeText(exercise?.name || "").includes("cardio"))
  );

  return (
    hasCardioAsWorkoutDay ||
    (trainingDays >= 4 && allDaysAreShallow) ||
    (experience === "avancado" && trainingDays >= 4 && averageExercises < 5)
  );
}

function ex(name: string, series: number, reps: number, load: string): WorkoutExercise {
  return { name, series, reps, load };
}

function buildWorkoutTemplates(days: number, experience: string): WorkoutTemplate[] {
  const advanced = experience === "avancado";
  const mainSets = advanced ? 4 : 3;
  const accessorySets = advanced ? 4 : 3;

  if (days <= 3) {
    return [
      {
        label: "Treino A - Full body com ênfase em superiores",
        exercises: [
          ex("Supino reto", mainSets, 8, "60kg"),
          ex("Remada curvada", mainSets, 8, "60kg"),
          ex("Agachamento livre", mainSets, 8, "80kg"),
          ex("Desenvolvimento militar", accessorySets, 10, "30kg"),
          ex("Rosca direta", 3, 12, "20kg"),
          ex("Tríceps na polia", 3, 12, "25kg")
        ]
      },
      {
        label: "Treino B - Full body com ênfase em pernas",
        exercises: [
          ex("Levantamento terra romeno", mainSets, 8, "70kg"),
          ex("Leg press", mainSets, 10, "160kg"),
          ex("Puxada alta", mainSets, 10, "55kg"),
          ex("Supino inclinado com halteres", accessorySets, 10, "30kg"),
          ex("Mesa flexora", 3, 12, "40kg"),
          ex("Elevação lateral", 3, 12, "12kg")
        ]
      },
      {
        label: "Treino C - Full body com ênfase em costas e posteriores",
        exercises: [
          ex("Barra fixa", mainSets, 8, "Peso corporal"),
          ex("Agachamento frontal", mainSets, 8, "60kg"),
          ex("Remada baixa", accessorySets, 10, "55kg"),
          ex("Crucifixo inclinado", 3, 12, "16kg"),
          ex("Panturrilha em pé", 4, 12, "60kg"),
          ex("Prancha abdominal", 3, 45, "Peso corporal")
        ]
      }
    ];
  }

  if (days === 4) {
    return [
      {
        label: "Treino A - Superiores força",
        exercises: [
          ex("Supino reto", mainSets, 6, "70kg"),
          ex("Remada curvada", mainSets, 8, "65kg"),
          ex("Desenvolvimento militar", mainSets, 8, "35kg"),
          ex("Puxada alta", accessorySets, 10, "60kg"),
          ex("Supino inclinado com halteres", 3, 10, "32kg"),
          ex("Rosca direta", 3, 10, "24kg"),
          ex("Tríceps testa", 3, 10, "25kg")
        ]
      },
      {
        label: "Treino B - Inferiores força",
        exercises: [
          ex("Agachamento livre", mainSets, 6, "90kg"),
          ex("Levantamento terra romeno", mainSets, 8, "80kg"),
          ex("Leg press", accessorySets, 10, "180kg"),
          ex("Mesa flexora", 3, 10, "45kg"),
          ex("Cadeira extensora", 3, 12, "50kg"),
          ex("Panturrilha em pé", 4, 12, "70kg")
        ]
      },
      {
        label: "Treino C - Superiores hipertrofia",
        exercises: [
          ex("Supino inclinado", accessorySets, 10, "55kg"),
          ex("Remada baixa", accessorySets, 10, "60kg"),
          ex("Crucifixo no cabo", 3, 12, "15kg"),
          ex("Face pull", 3, 15, "25kg"),
          ex("Elevação lateral", 4, 12, "12kg"),
          ex("Rosca alternada", 3, 12, "16kg"),
          ex("Tríceps corda", 3, 12, "25kg")
        ]
      },
      {
        label: "Treino D - Inferiores hipertrofia",
        exercises: [
          ex("Hack squat", accessorySets, 10, "90kg"),
          ex("Afundo com halteres", 3, 10, "24kg"),
          ex("Stiff", accessorySets, 10, "70kg"),
          ex("Cadeira flexora", 3, 12, "40kg"),
          ex("Cadeira extensora", 3, 12, "45kg"),
          ex("Panturrilha sentada", 4, 15, "45kg"),
          ex("Abdominal na polia", 3, 12, "30kg")
        ]
      }
    ];
  }

  if (days >= 6) {
    return [
      {
        label: "Treino A - Push força",
        exercises: [
          ex("Supino reto", mainSets, 6, "70kg"),
          ex("Desenvolvimento militar", mainSets, 8, "35kg"),
          ex("Supino inclinado com halteres", accessorySets, 8, "34kg"),
          ex("Paralelas", 3, 10, "Peso corporal"),
          ex("Elevação lateral", 4, 12, "12kg"),
          ex("Tríceps testa", 3, 10, "25kg")
        ]
      },
      {
        label: "Treino B - Pull força",
        exercises: [
          ex("Barra fixa", mainSets, 8, "Peso corporal"),
          ex("Remada curvada", mainSets, 8, "65kg"),
          ex("Puxada neutra", accessorySets, 10, "60kg"),
          ex("Remada unilateral", 3, 10, "34kg"),
          ex("Rosca direta", 3, 10, "24kg"),
          ex("Rosca martelo", 3, 12, "18kg")
        ]
      },
      {
        label: "Treino C - Pernas força",
        exercises: [
          ex("Agachamento livre", mainSets, 6, "90kg"),
          ex("Levantamento terra romeno", mainSets, 8, "80kg"),
          ex("Leg press", accessorySets, 10, "180kg"),
          ex("Mesa flexora", 3, 10, "45kg"),
          ex("Panturrilha em pé", 4, 12, "70kg")
        ]
      },
      {
        label: "Treino D - Push hipertrofia",
        exercises: [
          ex("Supino inclinado", accessorySets, 10, "55kg"),
          ex("Crucifixo no cabo", 3, 12, "15kg"),
          ex("Desenvolvimento com halteres", 3, 10, "26kg"),
          ex("Elevação lateral", 4, 15, "10kg"),
          ex("Tríceps corda", 3, 12, "25kg"),
          ex("Tríceps francês", 3, 12, "18kg")
        ]
      },
      {
        label: "Treino E - Pull hipertrofia",
        exercises: [
          ex("Puxada alta", accessorySets, 10, "60kg"),
          ex("Remada baixa", accessorySets, 10, "60kg"),
          ex("Pulldown", 3, 12, "35kg"),
          ex("Face pull", 3, 15, "25kg"),
          ex("Rosca alternada", 3, 12, "16kg"),
          ex("Rosca Scott", 3, 12, "20kg")
        ]
      },
      {
        label: "Treino F - Pernas hipertrofia",
        exercises: [
          ex("Hack squat", accessorySets, 10, "90kg"),
          ex("Stiff", accessorySets, 10, "70kg"),
          ex("Cadeira extensora", 3, 12, "50kg"),
          ex("Cadeira flexora", 3, 12, "40kg"),
          ex("Panturrilha sentada", 4, 15, "45kg"),
          ex("Abdominal na polia", 3, 12, "30kg")
        ]
      }
    ];
  }

  return [
    {
      label: "Treino A - Push: peito, ombros e tríceps",
      exercises: [
        ex("Supino reto", mainSets, 8, "70kg"),
        ex("Supino inclinado com halteres", accessorySets, 10, "34kg"),
        ex("Crucifixo no cabo", 3, 12, "15kg"),
        ex("Desenvolvimento militar", mainSets, 8, "35kg"),
        ex("Elevação lateral", 4, 12, "12kg"),
        ex("Tríceps testa", 3, 10, "25kg"),
        ex("Tríceps corda", 3, 12, "25kg")
      ]
    },
    {
      label: "Treino B - Pull: costas, trapézio e bíceps",
      exercises: [
        ex("Barra fixa", mainSets, 8, "Peso corporal"),
        ex("Remada curvada", mainSets, 8, "65kg"),
        ex("Puxada alta", accessorySets, 10, "60kg"),
        ex("Remada baixa", accessorySets, 10, "60kg"),
        ex("Face pull", 3, 15, "25kg"),
        ex("Rosca direta", 3, 10, "24kg"),
        ex("Rosca martelo", 3, 12, "18kg")
      ]
    },
    {
      label: "Treino C - Pernas: quadríceps, posteriores e panturrilhas",
      exercises: [
        ex("Agachamento livre", mainSets, 8, "90kg"),
        ex("Leg press", accessorySets, 10, "180kg"),
        ex("Levantamento terra romeno", mainSets, 8, "80kg"),
        ex("Cadeira extensora", 3, 12, "50kg"),
        ex("Mesa flexora", 3, 12, "45kg"),
        ex("Panturrilha em pé", 4, 12, "70kg"),
        ex("Abdominal na polia", 3, 12, "30kg")
      ]
    },
    {
      label: "Treino D - Superiores hipertrofia",
      exercises: [
        ex("Supino inclinado", accessorySets, 10, "55kg"),
        ex("Remada unilateral", accessorySets, 10, "34kg"),
        ex("Pulldown", 3, 12, "35kg"),
        ex("Desenvolvimento com halteres", 3, 10, "26kg"),
        ex("Elevação lateral", 4, 15, "10kg"),
        ex("Rosca Scott", 3, 12, "20kg"),
        ex("Tríceps francês", 3, 12, "18kg")
      ]
    },
    {
      label: "Treino E - Inferiores e core",
      exercises: [
        ex("Hack squat", accessorySets, 10, "90kg"),
        ex("Afundo com halteres", 3, 10, "24kg"),
        ex("Stiff", accessorySets, 10, "70kg"),
        ex("Cadeira flexora", 3, 12, "40kg"),
        ex("Cadeira extensora", 3, 12, "45kg"),
        ex("Panturrilha sentada", 4, 15, "45kg"),
        ex("Prancha abdominal", 3, 45, "Peso corporal")
      ]
    }
  ];
}

function templatesToWorkouts(templates: WorkoutTemplate[]) {
  return templates.reduce<Record<string, WorkoutExercise[]>>((acc, template, index) => {
    acc[String.fromCharCode(65 + index)] = template.exercises;
    return acc;
  }, {});
}

function formatWorkoutMessage(templates: WorkoutTemplate[]) {
  return [
    "Refiz seu treino e atualizei a Rotina com uma prescrição mais completa.",
    "",
    ...templates.map((template) => {
      const exercises = template.exercises.map((exercise) => exercise.name).join(", ");
      return `${template.label}: ${exercises}.`;
    }),
    "",
    "Confere a Rotina e me diz se quer ajustar algum grupo muscular, exercício ou carga."
  ].join("\n");
}

function normalizeWorkoutPlan(data: OnboardingResponse, currentPreviewData: any, messages: ChatMessage[]) {
  const previewData = mergePreviewData(currentPreviewData, data.previewData || {});
  const workouts = previewData.workouts;

  if (!shouldReplaceShallowWorkout(workouts, previewData, messages)) {
    return data;
  }

  const trainingDays = inferTrainingDays(previewData, messages);
  const experience = inferExperience(previewData, messages);
  const templates = buildWorkoutTemplates(trainingDays, experience);
  const profile = {
    ...(previewData.profile || {}),
    trainingDaysPerWeek: trainingDays,
    experience
  };

  return {
    ...data,
    message: formatWorkoutMessage(templates),
    previewData: {
      ...(data.previewData || {}),
      profile,
      workouts: templatesToWorkouts(templates)
    }
  };
}

function normalizeDietOrder(data: OnboardingResponse) {
  if (!Array.isArray(data.previewData?.diet)) {
    return data;
  }

  return {
    ...data,
    previewData: {
      ...(data.previewData || {}),
      diet: sortDietMeals(data.previewData.diet)
    }
  };
}

function isWorkoutPlanRequest(messages: ChatMessage[], currentPreviewData: any) {
  const lastMessage = normalizeText(lastUserText(messages));
  const hasExistingWorkout = currentPreviewData?.workouts && Object.keys(currentPreviewData.workouts).length > 0;

  return (
    lastMessage.includes("treino") ||
    lastMessage.includes("musculacao") ||
    lastMessage.includes("musculação") ||
    lastMessage.includes("abc") ||
    lastMessage.includes("abcd") ||
    lastMessage.includes("abcde") ||
    lastMessage.includes("refaz") ||
    lastMessage.includes("reformula") ||
    (hasExistingWorkout && (lastMessage.includes("de novo") || lastMessage.includes("faz de novo") || lastMessage.includes("mudar")))
  );
}

function buildDeterministicWorkoutResponse(currentPreviewData: any, messages: ChatMessage[]): OnboardingResponse {
  const previewData = mergePreviewData(currentPreviewData, {});
  const trainingDays = inferTrainingDays(previewData, messages);
  const experience = inferExperience(previewData, messages);
  const templates = buildWorkoutTemplates(trainingDays, experience);

  return {
    message: formatWorkoutMessage(templates),
    previewData: {
      ...previewData,
      profile: {
        ...(previewData.profile || {}),
        trainingDaysPerWeek: trainingDays,
        experience
      },
      workouts: templatesToWorkouts(templates)
    },
    finished: false
  };
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { messages, currentPreviewData } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Histórico de mensagens inválido" }, { status: 400 });
    }
    const chatMessages = messages as ChatMessage[];

    if (isWorkoutPlanRequest(chatMessages, currentPreviewData)) {
      return NextResponse.json(buildDeterministicWorkoutResponse(currentPreviewData, chatMessages));
    }

    // Prompt de sistema que orienta a IA a ser amigável e guiar o onboarding passo a passo
    const systemPrompt = `Você é o assistente virtual do "Ratos de Academia", um aplicativo de planejamento e registro de treinos e hábitos saudáveis.
Sua missão é atuar como um Personal Trainer e Nutricionista virtual, conduzindo o onboarding de forma extremamente concisa, direta ao ponto e passo a passo.

INSTRUÇÕES IMPORTANTES DE DIÁLOGO:
1. NÃO USE formatação Markdown crua como asteriscos (ex: **negrito**), marcadores de título (ex: # Título) ou outras tags semelhantes na propriedade "message". Retorne texto simples, limpo e bem formatado com parágrafos simples e emojis apropriados.
2. PERGUNTE UMA ÚNICA COISA DE CADA VEZ. Nunca acumule várias perguntas em um único turno de conversa. Em perguntas simples e confirmações, mantenha suas mensagens curtas (no máximo 2 ou 3 frases).
3. Responda sempre no formato JSON válido com os seguintes campos:
   - "message": A mensagem amigável (sem marcações markdown cruas) para o usuário.
   - "previewData": Objeto JSON contendo os dados estruturados validados.
   - "finished": Booleano (true/false) indicando se tudo foi finalizado e confirmado.
4. RESPOSTA E AÇÃO SIMULTÂNEAS: Quando o usuário solicitar ou você fizer alterações na rotina/dieta/treinos no "previewData", você DEVE atualizar o "previewData" e também descrever a entrega na propriedade "message". Para treino ou dieta, a mensagem não deve ser curta demais: ela precisa trazer redundantemente a divisão/lista criada, porque o usuário pode estar no mobile e não ver o preview imediatamente.
5. NUNCA DEIXE MENSAGENS INCOMPLETAS: Garanta que a propriedade "message" seja sempre uma frase completa e conclusiva. Nunca termine com dois pontos (ex: "Aqui está:") ou de forma abrupta, e nunca envie uma mensagem vazia que pareça ter sido cortada.
6. NUNCA PROMETA UMA MENSAGEM FUTURA: O chat funciona por turnos e você só responde depois de uma mensagem do usuário. Portanto, não diga "aguarde", "um momento", "vou preparar", "vou montar", "já te entrego" ou frases semelhantes. Se precisar criar ou refazer treino/dieta, faça isso integralmente nesta mesma resposta.
7. SE DISSER QUE VAI MOSTRAR ALGO, MOSTRE NA MESMA MENSAGEM: Não escreva "aqui está", "segue" ou "nova proposta:" sem listar o conteúdo logo depois. Nunca termine a mensagem com dois pontos.

SEQUÊNCIA DE ETAPAS (UMA PERGUNTA POR VEZ):
- ETAPA 1 (DADOS BÁSICOS):
  1. Pergunte apenas o gênero do usuário.
  2. Após ele responder, pergunte a idade dele.
  3. Após ele responder, pergunte há quanto tempo ele treina musculação. Não pergunte se ele é iniciante, intermediário ou avançado. Salve a resposta textual em "previewData.profile.trainingTime" e derive "previewData.profile.experience" assim: menos de 12 meses = "iniciante"; de 12 a 35 meses = "intermediario"; 36 meses ou mais = "avancado".
- ETAPA 2 (COMPOSIÇÃO CORPORAL):
  1. Pergunte se ele possui exame de bioimpedância recente ou se prefere fornecer apenas peso e altura (e avise que ele pode anexar o exame em formato de foto).
  2. Se ele disser peso/altura: pergunte primeiro a altura (em cm). Depois, pergunte o peso (em kg).
  3. Se ele enviar a bioimpedância (injetado via sistema): confirme apenas os dados extraídos em uma frase simples e pergunte se estão corretos.
- ETAPA 3 (CÁLCULO E MEDICAMENTOS):
  1. Calcule e apresente a TMB (Taxa Metabólica Basal) de forma resumida baseada nos dados.
  2. Pergunte se ele faz uso de medicamentos, hormônios, anabolizantes ou suplementações que deseja monitorar, coletando nome, dosagem, horário e frequência exata (ex: todo dia, uma vez por semana, dias alternados). Esta etapa vem antes de dieta e treino porque esses dados podem mudar completamente a prescrição.
- ETAPA 4 (OBJETIVO):
  1. Depois de medicamentos/suplementações, pergunte qual é o objetivo principal dele: bulking (ganho de massa magra), cutting (emagrecimento) ou manutenção de uma vida saudável.
  2. Salve o objetivo em "previewData.profile.goal" usando apenas "bulking", "cutting" ou "manutencao".
- ETAPA 5 (DIETA):
  1. Pergunte se ele já segue uma dieta ou quer uma sugestão.
  2. Se quer sugestão, apresente a divisão de refeições proposta (com Whey, Creatina inclusos). Pergunte se ele aprova essa dieta.
  3. IMPORTANTE: Ao criar a dieta no "previewData" (no campo "diet"), divida-a por REFEIÇÕES (ex: Café da Manhã, Almoço, Café da Tarde, Jantar, Ceia, etc. - você pode criar, renomear ou remover refeições conforme as necessidades do usuário). Dentro de cada refeição (na propriedade "items"), insira cada alimento individualmente (ex: se o almoço tem Arroz e Frango, insira "Arroz Branco" e "Frango Grelhado" como dois registros separados no array de alimentos "items" da refeição "Almoço", permitindo que o usuário dê check em cada um individualmente). Nunca agrupe refeições inteiras em itens genéricos como "Marmita" ou "Lanche".
  4. Organize as refeições em ordem cronológica natural do dia: Café da manhã, Lanche da manhã/Colação, Almoço, Pré-treino se existir, Lanche da tarde/Café da tarde, Pós-treino se existir, Jantar, Ceia.
  5. Quando criar ou refazer uma dieta, coloque a versão completa em "previewData.diet" e também escreva no "message" as refeições e principais alimentos/quantidades. Não diga apenas que atualizou o painel.
- ETAPA 6 (TREINO):
  1. Pergunte quantos dias ele pretende treinar por semana e salve a resposta em "previewData.profile.trainingDaysPerWeek".
  2. Proponha a divisão de treinos ideal para o contexto do usuário, sem se prender a um modelo fixo. A divisão pode ser Full Body, AB, ABC, ABCD, ABCDE ou outra estrutura coerente, conforme frequência semanal, nível, objetivo, dados corporais, recuperação e informações já coletadas.
  3. Ao criar o "workouts", aja como um profissional de educação física: escolha exercícios, volume, séries, repetições e distribuição muscular que façam sentido para aquele perfil. Um usuário adulto saudável fazendo musculação normal não deve receber um treino genérico ou subprescrito; cada dia precisa parecer uma sessão real e defensável de academia para o objetivo informado.
  4. Não use quantidade fixa obrigatória de exercícios, mas também não use treino minimalista como padrão. A quantidade deve nascer da prescrição correta para frequência, objetivo, experiência, biometria, recuperação, tempo disponível, restrições e equipamentos. Treinos com 2 ou 3 exercícios por dia só fazem sentido se houver justificativa explícita no contexto, como pouco tempo, lesão, retorno gradual, deload, equipamento muito limitado ou uma estratégia técnica específica.
  5. Para um adulto saudável, sem restrição explícita, fazendo musculação normal várias vezes por semana, cada sessão deve ter volume suficiente para estimular adequadamente os grupos daquele dia. Um usuário avançado treinando 5 dias por semana, por exemplo, não deve receber uma divisão inteira com apenas 3 exercícios por dia; isso tende a parecer subprescrição, não personalização.
  6. Monte cada dia com coerência de grupos musculares, priorizando movimentos compostos quando apropriado e complementando com isoladores conforme objetivo, nível e recuperação. Evite combinações pobres como um treino normal de peito/tríceps com apenas "Supino Reto" e "Tríceps na Polia" quando não houver justificativa clínica, logística ou de tempo.
  7. IMPORTANTE: Ao preencher o campo "load" dos exercícios de musculação em "workouts", use sempre valores em kg (ex: "20kg", "35kg", "50kg"). Nunca use percentual de 1RM (como "70% 1RM") nem expressões subjetivas (como "moderada", "pesada").
  8. Quando criar ou refazer um treino, coloque a versão completa em "previewData.workouts" e também escreva no "message" a divisão e os exercícios por treino. Exemplo de formato da mensagem: "Refiz seu treino e atualizei a Rotina.\nTreino A - Peito e tríceps: Supino reto, Supino inclinado, Crucifixo, Paralelas, Tríceps corda.\nTreino B - Costas e bíceps: ...\nConfere a Rotina e me diz se quer ajustar algo."
- ETAPA 7 (CARDIO):
  1. Pergunte se ele gostaria de fazer exercícios aeróbicos (tipo, duração, intensidade).
- ETAPA 8 (CONFIRMAÇÃO FINAL):
  1. Pergunte de forma muito concisa se ele está pronto para salvar a rotina no aplicativo. Somente depois de ele aceitar, defina "finished": true.

REGRAS DO "previewData":
- Só inclua os dados no "previewData" à medida que forem combinados e confirmados. Não adivinhe ou crie dados futuros.
- Todo dado coletado deve ser preservado no "previewData": gênero, idade, tempo de treino, experiência derivada, objetivo, dias de treino por semana, biometria completa, TMB, dieta, treinos, aeróbico e medicamentos. Use todos esses dados como contexto ao criar treino ou dieta.
- Medicamentos, hormônios, anabolizantes e suplementações coletados antes do objetivo devem ser considerados obrigatoriamente ao montar dieta e treino. Se houver uso de algo como durateston, testosterona, oxandrolona ou similares, não ignore esse dado na prescrição.
- Ao devolver "diet", mantenha as refeições em ordem cronológica natural do dia.
- No campo "load" de "workouts", defina sempre a carga em kg (ex: "15kg", "25kg", "40kg"). Nunca use termos subjetivos ou percentuais de 1RM.
- No campo "workouts", cada chave de treino (ex: "A", "B", "C") deve conter uma sessão completa e coerente para aquele dia, com exercícios, séries, repetições e carga em kg para todos.
- Não deixe o campo "workouts" com sessões rasas quando os dados indicarem treino normal de academia. Se não houver restrição explícita, uma divisão de 4, 5 ou 6 dias com todos os dias contendo apenas 2 ou 3 exercícios é sinal de prescrição fraca e deve ser melhorada antes de responder.
- Antes de devolver o "workouts", revise mentalmente se a prescrição está compatível com idade, gênero, objetivo, frequência semanal, nível declarado, recuperação e dados corporais. Se parecer um treino incompleto, genérico ou fraco para o cenário informado, melhore a prescrição antes de responder.
- Siga estritamente esta estrutura para o "previewData":
  {
    "profile": {
      "gender": "masculino" | "feminino" | "outro",
      "age": number,
      "trainingTime": string,
      "experience": "iniciante" | "intermediario" | "avancado",
      "goal": "bulking" | "cutting" | "manutencao",
      "trainingDaysPerWeek": number
    },
    "biometrics": {
      "height": number,
      "weight": number,
      "fatPct": number,
      "muscleMass": number,
      "tmb": number
    },
    "diet": Array<{ 
      "name": string, 
      "items": Array<{ "name": string, "calories": number, "amount": string }> 
    }>,
    "workouts": {
      [letter: string]: Array<{ "name": string, "series": number, "reps": number, "load": string }> // ex: "20kg", "35kg"
    },
    "aerobic": {
      "name": string,
      "duration": number
    },
    "meds": Array<{ 
      "name": string, 
      "dose": string, 
      "time": string,
      "frequency": {
        "type": "daily" | "weekdays" | "alternate" | "custom",
        "daysOfWeek"?: Array<number> // [0=Domingo, 1=Segunda, etc.] se type for "custom"
      }
    }>
  }

Retorne apenas o JSON puro, sem blocos de código markdown como \`\`\`json.`;

    let finalSystemPrompt = systemPrompt;
    if (currentPreviewData && Object.keys(currentPreviewData).length > 0) {
      finalSystemPrompt += `\n\nATENÇÃO: Estes são TODOS os dados estruturados coletados até agora e eles são a fonte de verdade para criar treino/dieta:\n${JSON.stringify(currentPreviewData)}\n
Você DEVE usar esses dados como contexto clínico/prático: perfil, tempo de treino, experiência derivada, dias de treino, objetivo, biometria, TMB, gordura corporal, massa muscular, dieta, treinos, aeróbico e medicamentos. Também DEVE incluir integralmente esses dados nas chaves correspondentes do seu objeto "previewData" de retorno, realizando apenas as edições, inclusões ou exclusões solicitadas explicitamente pelo usuário na conversa. Nunca devolva chaves de treinos ("workouts"), dieta ("diet"), cardio ("aerobic"), perfil ("profile") ou biometria ("biometrics") vazias ou zeradas se esses dados já existiam no preview anterior e o usuário não pediu para excluí-los.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: finalSystemPrompt },
        ...chatMessages
      ],
      temperature: 0.7,
    });

    const contentText = response.choices[0].message?.content || "{}";
    const data = normalizeWorkoutPlan(
      normalizeDietOrder(JSON.parse(contentText) as OnboardingResponse),
      currentPreviewData,
      chatMessages
    );

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Erro na rota de chat do onboarding:", error);
    return NextResponse.json({ error: "Erro ao processar conversa com a IA" }, { status: 500 });
  }
}
