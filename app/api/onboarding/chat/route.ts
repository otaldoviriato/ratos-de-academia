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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lastUserText(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content || "";
  }
  return "";
}

function allConversationText(messages: ChatMessage[]) {
  return messages.map((message) => message.content || "").join("\n");
}

function hasWaitingPromise(message: string) {
  const text = normalizeText(message);
  return [
    "um momento",
    "aguarde",
    "vou elaborar",
    "vou preparar",
    "vou montar",
    "estou montando",
    "ja te entrego",
    "ja te envio",
    "vou registrar isso agora",
    "vou refazer"
  ].some((pattern) => text.includes(pattern));
}

function hasIncompleteDelivery(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (trimmed.endsWith(":")) return true;

  const text = normalizeText(trimmed);
  return [
    "aqui esta uma nova proposta de treino para voce",
    "aqui esta o treino para voce",
    "aqui esta a dieta para voce",
    "segue o treino",
    "segue a dieta"
  ].some((pattern) => text.endsWith(pattern));
}

function hasWorkflowChange(data: OnboardingResponse, previousPreviewData: any) {
  const nextPreview = data.previewData || {};
  const previousWorkouts = JSON.stringify(previousPreviewData?.workouts || {});
  const nextWorkouts = JSON.stringify(nextPreview.workouts || {});
  const previousDiet = JSON.stringify(previousPreviewData?.diet || []);
  const nextDiet = JSON.stringify(nextPreview.diet || []);

  return previousWorkouts !== nextWorkouts || previousDiet !== nextDiet;
}

function hasExplicitWorkoutConstraints(text: string) {
  return [
    "pouco tempo",
    "treino curto",
    "ultracurto",
    "rapido",
    "rápido",
    "30 minutos",
    "20 minutos",
    "lesao",
    "lesão",
    "dor",
    "em casa",
    "sem equipamento",
    "equipamento limitado",
    "apenas halter",
    "so halter",
    "só halter",
    "calistenia"
  ].some((pattern) => normalizeText(text).includes(normalizeText(pattern)));
}

function isAdvancedContext(text: string, previewData: any) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("avancado") ||
    normalized.includes("avançado") ||
    normalizeText(previewData?.profile?.experience || "").includes("avancado")
  );
}

function hasWeakAdvancedWorkout(data: OnboardingResponse, currentPreviewData: any, messages: ChatMessage[]) {
  const nextWorkouts = data.previewData?.workouts;
  if (!nextWorkouts || typeof nextWorkouts !== "object") return false;

  const conversationText = allConversationText(messages);
  if (!isAdvancedContext(conversationText, data.previewData || currentPreviewData || {})) return false;
  if (hasExplicitWorkoutConstraints(conversationText)) return false;

  const workoutDays = Object.values(nextWorkouts).filter(Array.isArray) as any[][];
  if (workoutDays.length === 0) return false;

  const hasWorkoutRequest = normalizeText(lastUserText(messages)).includes("treino");
  const workoutsChanged = JSON.stringify(currentPreviewData?.workouts || {}) !== JSON.stringify(nextWorkouts || {});
  if (!hasWorkoutRequest && !workoutsChanged) return false;

  return workoutDays.every((day) => day.length <= 3);
}

function validateOnboardingResponse(data: OnboardingResponse, currentPreviewData: any, messages: ChatMessage[]) {
  const failures: string[] = [];
  const message = data.message || "";

  if (hasWaitingPromise(message)) {
    failures.push("A mensagem promete que algo será feito depois, mas o chat só responde após nova mensagem do usuário.");
  }

  if (hasIncompleteDelivery(message)) {
    failures.push("A mensagem anuncia uma entrega, mas está incompleta ou termina como introdução.");
  }

  if (hasWorkflowChange(data, currentPreviewData) && message.length < 80) {
    failures.push("O preview foi alterado, mas a mensagem não resume de forma suficiente o que mudou.");
  }

  if (hasWeakAdvancedWorkout(data, currentPreviewData, messages)) {
    failures.push("O treino gerado parece subprescrito para um usuário avançado sem restrições claras; refaça com uma prescrição mais defensável.");
  }

  return failures;
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

    // Prompt de sistema que orienta a IA a ser amigável e guiar o onboarding passo a passo
    const systemPrompt = `Você é o assistente virtual do "Ratos de Academia", um aplicativo de planejamento e registro de treinos e hábitos saudáveis.
Sua missão é atuar como um Personal Trainer e Nutricionista virtual, conduzindo o onboarding de forma extremamente concisa, direta ao ponto e passo a passo.

INSTRUÇÕES IMPORTANTES DE DIÁLOGO:
1. NÃO USE formatação Markdown crua como asteriscos (ex: **negrito**), marcadores de título (ex: # Título) ou outras tags semelhantes na propriedade "message". Retorne texto simples, limpo e bem formatado com parágrafos simples e emojis apropriados.
2. PERGUNTE UMA ÚNICA COISA DE CADA VEZ. Nunca acumule várias perguntas em um único turno de conversa. Mantenha suas mensagens curtas (no máximo 2 ou 3 frases).
3. Responda sempre no formato JSON válido com os seguintes campos:
   - "message": A mensagem amigável (sem marcações markdown cruas) para o usuário.
   - "previewData": Objeto JSON contendo os dados estruturados validados.
   - "finished": Booleano (true/false) indicando se tudo foi finalizado e confirmado.
4. RESPOSTA E AÇÃO SIMULTÂNEAS: Quando o usuário solicitar ou você fizer alterações na rotina/dieta/treinos no "previewData", você DEVE fornecer uma resposta completa e amigável na propriedade "message" informando brevemente o que foi feito, orientando o usuário a conferir as atualizações aplicadas no painel lateral de preview ao lado e perguntando se ele aprova ou deseja ajustar algo.
5. NUNCA DEIXE MENSAGENS INCOMPLETAS: Garanta que a propriedade "message" seja sempre uma frase completa e conclusiva. Nunca termine com dois pontos (ex: "Aqui está:") ou de forma abrupta, e nunca envie uma mensagem vazia que pareça ter sido cortada.
6. NUNCA PROMETA UMA MENSAGEM FUTURA: O chat funciona por turnos e você só responde depois de uma mensagem do usuário. Portanto, não diga "aguarde", "um momento", "vou preparar", "vou montar", "já te entrego" ou frases semelhantes. Se precisar criar ou refazer treino/dieta, faça isso integralmente nesta mesma resposta.
7. SE DISSER QUE VAI MOSTRAR ALGO, MOSTRE OU RESUMA: Não escreva "aqui está", "segue" ou "nova proposta:" sem entregar um resumo concreto na própria mensagem e sem atualizar o "previewData".

SEQUÊNCIA DE ETAPAS (UMA PERGUNTA POR VEZ):
- ETAPA 1 (DADOS BÁSICOS):
  1. Pergunte apenas o gênero do usuário.
  2. Após ele responder, pergunte a idade dele.
  3. Após ele responder, pergunte sobre a experiência dele com musculação (iniciante, intermediário, avançado).
- ETAPA 2 (COMPOSIÇÃO CORPORAL):
  1. Pergunte se ele possui exame de bioimpedância recente ou se prefere fornecer apenas peso e altura (e avise que ele pode anexar o exame em formato de foto).
  2. Se ele disser peso/altura: pergunte primeiro a altura (em cm). Depois, pergunte o peso (em kg).
  3. Se ele enviar a bioimpedância (injetado via sistema): confirme apenas os dados extraídos em uma frase simples e pergunte se estão corretos.
- ETAPA 3 (CÁLCULO E OBJETIVO):
  1. Calcule e apresente a TMB (Taxa Metabólica Basal) de forma resumida baseada nos dados.
  2. Pergunte qual o objetivo principal dele (Hipertrofia, Emagrecimento, ou Manutenção/Saúde).
- ETAPA 4 (DIETA & SUPLEMENTAÇÃO):
  1. Pergunte se ele já segue uma dieta ou quer uma sugestão.
  2. Se quer sugestão, apresente a divisão de refeições proposta (com Whey, Creatina inclusos). Pergunte se ele aprova essa dieta.
  3. IMPORTANTE: Ao criar a dieta no "previewData" (no campo "diet"), divida-a por REFEIÇÕES (ex: Café da Manhã, Almoço, Café da Tarde, Jantar, Ceia, etc. - você pode criar, renomear ou remover refeições conforme as necessidades do usuário). Dentro de cada refeição (na propriedade "items"), insira cada alimento individualmente (ex: se o almoço tem Arroz e Frango, insira "Arroz Branco" e "Frango Grelhado" como dois registros separados no array de alimentos "items" da refeição "Almoço", permitindo que o usuário dê check em cada um individualmente). Nunca agrupe refeições inteiras em itens genéricos como "Marmita" ou "Lanche".
- ETAPA 5 (TREINO):
  1. Pergunte quantos dias ele pretende treinar por semana.
  2. Proponha a divisão de treinos ideal para o contexto do usuário, sem se prender a um modelo fixo. A divisão pode ser Full Body, AB, ABC, ABCD, ABCDE ou outra estrutura coerente, conforme frequência semanal, nível, objetivo, dados corporais, recuperação e informações já coletadas.
  3. Ao criar o "workouts", aja como um profissional de educação física: escolha exercícios, volume, séries, repetições e distribuição muscular que façam sentido para aquele perfil. Um usuário adulto saudável fazendo musculação normal não deve receber um treino genérico ou subprescrito; cada dia precisa parecer uma sessão real e defensável de academia para o objetivo informado.
  4. Não use quantidade fixa obrigatória de exercícios. Se 2 exercícios forem realmente ideais para um contexto específico, use 2; se 8 forem necessários, use 8. A quantidade deve nascer da prescrição correta, não de uma regra artificial.
  5. Monte cada dia com coerência de grupos musculares, priorizando movimentos compostos quando apropriado e complementando com isoladores conforme objetivo, nível e recuperação. Evite combinações pobres como um treino normal de peito/tríceps com apenas "Supino Reto" e "Tríceps na Polia" quando não houver justificativa clínica, logística ou de tempo.
  6. IMPORTANTE: Ao preencher o campo "load" dos exercícios de musculação em "workouts", use sempre valores em kg (ex: "20kg", "35kg", "50kg"). Nunca use percentual de 1RM (como "70% 1RM") nem expressões subjetivas (como "moderada", "pesada").
- ETAPA 6 (CARDIO):
  1. Pergunte se ele gostaria de fazer exercícios aeróbicos (tipo, duração, intensidade).
- ETAPA 7 (MEDICAMENTOS):
  1. Pergunte se ele faz uso de medicamentos ou suplementações que deseja monitorar, coletando o nome, dosagem, horário e a frequência exata (ex: se toma todo dia, uma vez por semana, dias alternados).
- ETAPA 8 (CONFIRMAÇÃO FINAL):
  1. Pergunte de forma muito concisa se ele está pronto para salvar a rotina no aplicativo. Somente depois de ele aceitar, defina "finished": true.

REGRAS DO "previewData":
- Só inclua os dados no "previewData" à medida que forem combinados e confirmados. Não adivinhe ou crie dados futuros.
- No campo "load" de "workouts", defina sempre a carga em kg (ex: "15kg", "25kg", "40kg"). Nunca use termos subjetivos ou percentuais de 1RM.
- No campo "workouts", cada chave de treino (ex: "A", "B", "C") deve conter uma sessão completa e coerente para aquele dia, com exercícios, séries, repetições e carga em kg para todos.
- Antes de devolver o "workouts", revise mentalmente se a prescrição está compatível com idade, gênero, objetivo, frequência semanal, nível declarado, recuperação e dados corporais. Se parecer um treino incompleto, genérico ou fraco para o cenário informado, melhore a prescrição antes de responder.
- Siga estritamente esta estrutura para o "previewData":
  {
    "profile": {
      "gender": "masculino" | "feminino" | "outro",
      "age": number,
      "goal": "hipertrofia" | "emagrecimento" | "saude"
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
      finalSystemPrompt += `\n\nATENÇÃO: A rotina atual planejada do usuário contém os seguintes dados de preview:\n${JSON.stringify(currentPreviewData)}\n
Você DEVE incluir integralmente todos esses dados nas chaves correspondentes do seu objeto "previewData" de retorno, realizando apenas as edições, inclusões ou exclusões solicitadas explicitamente pelo usuário na conversa. Nunca devolva chaves de treinos ("workouts"), dieta ("diet"), cardio ("aerobic"), perfil ("profile") ou biometria ("biometrics") vazias ou zeradas se esses dados já existiam no preview anterior e o usuário não pediu para excluí-los.`;
    }

    const runCompletion = async (guardFeedback?: string) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: finalSystemPrompt },
          ...(guardFeedback ? [{ role: "system" as const, content: guardFeedback }] : []),
          ...chatMessages
        ],
        temperature: 0.7,
      });

      const contentText = response.choices[0].message?.content || "{}";
      return JSON.parse(contentText) as OnboardingResponse;
    };

    let data = await runCompletion();
    const validationFailures = validateOnboardingResponse(data, currentPreviewData, chatMessages);

    if (validationFailures.length > 0) {
      data = await runCompletion(`A resposta anterior foi bloqueada pelo validador do produto pelos seguintes motivos:
${validationFailures.map((failure) => `- ${failure}`).join("\n")}

Refaça a resposta agora. Ela precisa ser completa neste mesmo turno, sem prometer mensagem futura. Se o usuário pediu para refazer treino ou dieta, atualize o previewData correspondente agora e escreva uma mensagem finalizada resumindo concretamente o que mudou. Retorne apenas JSON puro.`);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Erro na rota de chat do onboarding:", error);
    return NextResponse.json({ error: "Erro ao processar conversa com a IA" }, { status: 500 });
  }
}
