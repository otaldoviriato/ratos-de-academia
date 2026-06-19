"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Paperclip, 
  Dumbbell, 
  Utensils, 
  Activity, 
  Pill, 
  Timer, 
  Check, 
  Loader2, 
  User, 
  Scale, 
  Sparkles,
  X,
  RotateCw
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { completeOnboardingAction, saveOnboardingProgressAction, cancelOnboardingAdjustmentAction, resetOnboardingAction, Plan, UserProfile } from "../actions";

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

function sortDietMeals(diet: any[] = []) {
  return [...diet].sort((a, b) => {
    const orderDiff = getMealOrderIndex(a?.name) - getMealOrderIndex(b?.name);
    return orderDiff || String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR");
  });
}

function normalizePreviewData(data: any) {
  if (!data) return data;
  return Array.isArray(data.diet) ? { ...data, diet: sortDietMeals(data.diet) } : data;
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

function mergePreviewData(prev: any, next: any) {
  if (!next) return prev;
  if (!prev) {
    return Array.isArray(next.diet) ? { ...next, diet: sortDietMeals(next.diet) } : next;
  }

  const merged = { ...prev };

  // Profile
  if (next.profile && Object.keys(next.profile).length > 0) {
    merged.profile = { ...prev.profile, ...next.profile };
  }

  // Biometrics
  if (next.biometrics && Object.keys(next.biometrics).length > 0) {
    merged.biometrics = { ...prev.biometrics, ...next.biometrics };
  }

  // Diet
  if (next.diet && Array.isArray(next.diet) && next.diet.length > 0) {
    merged.diet = sortDietMeals(next.diet);
  }

  // Workouts
  if (next.workouts && Object.keys(next.workouts).length > 0) {
    merged.workouts = { ...prev.workouts, ...next.workouts };
  }

  // Aerobic
  if (next.aerobic && Object.keys(next.aerobic).length > 0 && next.aerobic.name) {
    merged.aerobic = { ...prev.aerobic, ...next.aerobic };
  }

  return merged;
}

function didRoutinePresentationChange(prev: any, next: any) {
  if (!next) return false;

  const prevWorkouts = JSON.stringify(prev?.workouts || {});
  const nextWorkouts = JSON.stringify(next?.workouts || {});
  const prevDiet = JSON.stringify(prev?.diet || []);
  const nextDiet = JSON.stringify(next?.diet || []);

  return prevWorkouts !== nextWorkouts || prevDiet !== nextDiet;
}

function getTrainingDays(daysPerWeek?: number) {
  const days = Number(daysPerWeek);
  if (days <= 2) return [1, 4].slice(0, Math.max(days, 1));
  if (days === 3) return [1, 3, 5];
  if (days === 4) return [1, 2, 4, 5];
  if (days >= 6) return [1, 2, 3, 4, 5, 6].slice(0, Math.min(days, 6));
  return [1, 2, 3, 4, 5];
}

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type OnboardingChatProps = {
  profile: UserProfile | null;
  onComplete: () => void;
};

const initialOnboardingMessages: Message[] = [
  {
    role: "assistant",
    content: "E aí, maromba! Seja muito bem-vindo ao Ratos de Academia! 💪🔥\n\nEu sou o Ratão, seu parceiro e mascote oficial de treinos. Estou aqui para te ajudar a estruturar toda a sua rotina de ferro sem complicação.\n\nPara a gente começar a planejar: qual é o seu gênero?"
  }
];

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

export default function OnboardingChat({ profile, onComplete }: OnboardingChatProps) {
  const isAdjustmentMode = !!profile?.onboardingState?.isAdjustment;

  const handleCancelAdjustment = async () => {
    try {
      await cancelOnboardingAdjustmentAction();
    } catch (err) {
      console.error("Erro ao cancelar ajustes:", err);
    }
    onComplete();
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    if (profile?.onboardingState?.messages && profile.onboardingState.messages.length > 0) {
      return profile.onboardingState.messages;
    }
    return [
      ...initialOnboardingMessages
    ];
  });
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewData, setPreviewData] = useState<any>(() => {
    return normalizePreviewData(profile?.onboardingState?.previewData || {});
  });
  const [finished, setFinished] = useState(() => {
    return profile?.onboardingState?.finished || false;
  });
  const [showPreview, setShowPreview] = useState(false);

  const handleResetOnboarding = async () => {
    try {
      await resetOnboardingAction();
      setMessages([...initialOnboardingMessages]);
      setInput("");
      setPreviewData({});
      setFinished(false);
      setShowPreview(false);
      setUploadError("");
    } catch (err) {
      console.error("Erro ao resetar onboarding:", err);
    }
  };

  // Auto-salvar quando finished for true
  useEffect(() => {
    if (finished && !isSaving) {
      handleSaveOnboarding();
    }
  }, [finished]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll apenas no painel interno de mensagens, sem mover a viewport do navegador.
  useEffect(() => {
    const scrollArea = chatScrollRef.current;
    if (!scrollArea) return;

    requestAnimationFrame(() => {
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: "smooth"
      });
    });
  }, [messages, isTyping]);

  // Reinicializa o estado interno se um novo perfil (ex: modo de ajustes) for carregado
  useEffect(() => {
    if (profile) {
      if (profile.onboardingState?.messages) {
        setMessages(profile.onboardingState.messages);
      }
      setPreviewData(normalizePreviewData(profile.onboardingState?.previewData || {}));
      setFinished(profile.onboardingState?.finished || false);
    }
  }, [profile]);

  // Devolve o foco ao input de texto assim que a IA termina de digitar/processar
  useEffect(() => {
    if (!isTyping && !isUploading && !finished) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [isTyping, isUploading, finished]);

  const handleSendMessage = async (textToSend: string, isSystemMsg = false) => {
    if (!textToSend.trim()) return;

    let updatedMessages: Message[] = [...messages];
    
    if (!isSystemMsg) {
      updatedMessages.push({ role: "user", content: textToSend });
      setMessages(updatedMessages);
      setInput("");
    }

    setIsTyping(true);

    try {
      const response = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: updatedMessages.filter(m => m.role !== "system" || m.content.startsWith("[Sistema")),
          currentPreviewData: previewData,
          isAdjustment: isAdjustmentMode
        }),
      });

      if (!response.ok) {
        throw new Error("Erro na comunicação com a IA");
      }

      const data = await response.json();

      const newAiMsg: Message = data.message ? { role: "assistant", content: data.message } : { role: "assistant", content: "" };
      const finalMessages = [...updatedMessages, newAiMsg];

      if (data.message) {
        setMessages(finalMessages);
      }

      const mergedPreview = data.previewData ? mergePreviewData(previewData, data.previewData) : previewData;

      if (data.previewData) {
        setPreviewData(mergedPreview);
        if (didRoutinePresentationChange(previewData, mergedPreview)) {
          setShowPreview(true);
        }
      }

      if (data.finished !== undefined) {
        setFinished(data.finished);
      }

      // Salva o progresso no MongoDB em background
      saveOnboardingProgressAction(
        finalMessages.filter(m => !m.content.startsWith("[Sistema")),
        mergedPreview,
        data.finished || false
      ).catch(err => console.error("Erro ao salvar progresso do onboarding:", err));
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev, 
        { role: "assistant", content: "Desculpe, ocorreu um erro ao processar minha resposta. Poderia tentar responder novamente?" }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || "Erro ao fazer upload do arquivo");
      }

      const extracted = resData.data;
      
      // Constrói as mensagens adicionais para enviar à IA
      const systemMessageText = `[Sistema: O usuário fez upload do seu exame de bioimpedância. Os dados extraídos foram: peso: ${extracted.weight || "não identificado"}kg, altura: ${extracted.height || "não identificado"}cm, percentual de gordura: ${extracted.fatPct || "não identificado"}%, massa muscular: ${extracted.muscleMass || "não identificado"}kg, tmb: ${extracted.tmb || "não identificado"}kcal. Por favor, confirme estes dados com o usuário no chat e prossiga com o fluxo a partir daqui]`;
      
      const userVisualMsg: Message = { role: "user", content: "📄 Enviei a imagem do meu exame de bioimpedância para análise." };
      const systemInstructionMsg: Message = { role: "user", content: systemMessageText };

      // Atualiza o estado das mensagens visualmente na tela
      setMessages(prev => [...prev, userVisualMsg]);

      // Envia imediatamente a conversa contendo as mensagens adicionadas para a API
      const historyToSend = [...messages, userVisualMsg, systemInstructionMsg];

      setIsTyping(true);
      try {
        const chatResponse = await fetch("/api/onboarding/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            messages: historyToSend,
            currentPreviewData: previewData,
            isAdjustment: isAdjustmentMode
          }),
        });

        if (!chatResponse.ok) {
          throw new Error("Erro na comunicação com a IA");
        }

        const data = await chatResponse.json();

        const newAiMsg: Message = data.message ? { role: "assistant", content: data.message } : { role: "assistant", content: "" };
        const finalMessages = [...historyToSend, newAiMsg];

        if (data.message) {
          setMessages(prev => [...prev, newAiMsg]);
        }

        const mergedPreview = data.previewData ? mergePreviewData(previewData, data.previewData) : previewData;

        if (data.previewData) {
          setPreviewData(mergedPreview);
          if (didRoutinePresentationChange(previewData, mergedPreview)) {
            setShowPreview(true);
          }
        }

        if (data.finished !== undefined) {
          setFinished(data.finished);
        }

        // Salva o progresso no MongoDB
        saveOnboardingProgressAction(
          finalMessages.filter(m => !m.content.startsWith("[Sistema")),
          mergedPreview,
          data.finished || false
        ).catch(err => console.error("Erro ao salvar progresso do onboarding pós-upload:", err));
      } catch (error) {
        console.error("Erro ao processar resposta da IA após upload:", error);
        setMessages(prev => [
          ...prev, 
          { role: "assistant", content: "Desculpe, ocorreu um erro ao extrair as informações. Poderia digitar seus dados de peso e altura?" }
        ]);
      } finally {
        setIsTyping(false);
      }

    } catch (err: any) {
      setUploadError(err.message || "Erro no upload.");
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveOnboarding = async () => {
    setIsSaving(true);
    try {
      const profileData: Omit<UserProfile, "userId" | "isOnboarded"> = {
        gender: previewData.profile?.gender || "outro",
        age: previewData.profile?.age || 20,
        trainingTime: previewData.profile?.trainingTime,
        experience: previewData.profile?.experience,
        goal: previewData.profile?.goal || "manutencao",
        trainingDaysPerWeek: previewData.profile?.trainingDaysPerWeek,
        biometrics: {
          height: previewData.biometrics?.height,
          weight: previewData.biometrics?.weight,
          fatPct: previewData.biometrics?.fatPct,
          muscleMass: previewData.biometrics?.muscleMass,
          tmb: previewData.biometrics?.tmb
        }
      };

      const plansToInsert: Omit<Plan, "userId" | "_id">[] = [];

      // 1. Planos de Dieta
      if (previewData.diet && previewData.diet.length > 0) {
        plansToInsert.push({
          type: "dieta",
          title: "Plano Alimentar Inteligente",
          frequency: { type: "daily" },
          startDate: new Date().toISOString().split("T")[0],
          details: {
            meals: sortDietMeals(previewData.diet)
          }
        });
      }

      // 2. Planos de Musculação
      if (previewData.workouts && Object.keys(previewData.workouts).length > 0) {
        const letters = Object.keys(previewData.workouts).sort();
        plansToInsert.push({
          type: "musculacao",
          title: "Divisão de Treinos Onboarding",
          frequency: {
            type: "rotation",
            rotationRoutine: letters,
            rotationDays: getTrainingDays(previewData.profile?.trainingDaysPerWeek)
          },
          startDate: new Date().toISOString().split("T")[0],
          details: {
            routine: letters[0],
            workouts: previewData.workouts
          }
        });
      }

      // 3. Plano de Cardio/Aeróbico
      if (previewData.aerobic && previewData.aerobic.name) {
        plansToInsert.push({
          type: "aerobico",
          title: `Aeróbico: ${previewData.aerobic.name}`,
          frequency: { type: "daily" },
          startDate: new Date().toISOString().split("T")[0],
          details: {
            aerobic: {
              name: previewData.aerobic.name,
              duration: Number(previewData.aerobic.duration) || 30,
              done: false
            }
          }
        });
      }

      // 5. Plano de Bioimpedância
      if (previewData.biometrics) {
        plansToInsert.push({
          type: "bioimpedancia",
          title: "Acompanhamento Antropométrico",
          frequency: { type: "custom", daysOfWeek: [1] }, // Toda segunda padrão
          startDate: new Date().toISOString().split("T")[0],
          details: {
            bio: {
              weight: previewData.biometrics.weight,
              fatPct: previewData.biometrics.fatPct,
              muscleMass: previewData.biometrics.muscleMass,
              done: false
            }
          }
        });
      }

      const res = await completeOnboardingAction(profileData, plansToInsert);
      if (res.success) {
        onComplete();
      }
    } catch (error) {
      console.error("Erro ao salvar dados de onboarding:", error);
      alert("Erro ao gravar rotina no banco de dados. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const currentWorkoutsKeys = previewData.workouts ? Object.keys(previewData.workouts).sort() : [];
  const [selectedWorkoutTab, setSelectedWorkoutTab] = useState("");

  useEffect(() => {
    if (currentWorkoutsKeys.length > 0 && !selectedWorkoutTab) {
      setSelectedWorkoutTab(currentWorkoutsKeys[0]);
    }
  }, [currentWorkoutsKeys, selectedWorkoutTab]);

  return (
    <main className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-coal text-zinc-50 sm:static sm:h-auto sm:min-h-dvh sm:flex sm:flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="subtle-grid fixed inset-0 opacity-25 animate-[fadeIn_0.5s_ease-out]" />

      {/* Header Superior para Desktop */}
      <header className="hidden sm:flex items-center justify-between w-full max-w-[430px] md:max-w-5xl px-5 py-3 bg-graphite/60 border border-white/10 rounded-2xl backdrop-blur-xl mb-4 shadow-xl shrink-0 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <img src="/logo.png" alt="Ratos de Academia" className="h-full w-full object-contain" />
          </div>
          <div>
            <h2 className="font-black text-[11px] tracking-widest text-white leading-none">
              RATOS DE ACADEMIA
            </h2>
            <p className="text-[8px] text-acid font-bold tracking-wider mt-0.5 uppercase">
              Onboarding Inteligente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Botão Ver Rotina */}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-acid bg-acid/10 hover:bg-acid/20 border border-acid/30 rounded-lg transition-all cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            Ver Rotina
          </button>

          {(profile?.isOnboarded || isAdjustmentMode) && (
            <button
              onClick={isAdjustmentMode ? handleCancelAdjustment : onComplete}
              className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg transition-all cursor-pointer"
            >
              Voltar
            </button>
          )}
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer">
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

      {/* Seção principal do chat, com bordas arredondadas e card no desktop */}
      <section className="relative mx-auto flex h-full w-full max-w-[430px] md:max-w-5xl flex-col overflow-hidden bg-coal shadow-2xl shadow-black/50 sm:h-[800px] md:h-[750px] sm:max-h-[85dvh] sm:rounded-[2rem] sm:border sm:border-white/10">
        
        {/* Header Superior Interno (apenas visível no Mobile) */}
        <header className="flex sm:hidden items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-graphite/70 backdrop-blur-xl shrink-0">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <img src="/logo.png" alt="Ratos de Academia" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-[13px] leading-tight tracking-wide text-acid">
                RATOS DE ACADEMIA
              </h1>
              <p className="truncate text-[9px] text-zinc-500 font-bold uppercase tracking-wide">
                Onboarding Inteligente
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Botão Ver Rotina */}
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-acid/25 bg-acid/10 px-2.5 text-[11px] font-black text-acid transition-all hover:bg-acid/20 cursor-pointer"
            >
              <Activity className="h-3.5 w-3.5" />
              Rotina
            </button>

            {(profile?.isOnboarded || isAdjustmentMode) && (
              <button
                onClick={isAdjustmentMode ? handleCancelAdjustment : onComplete}
                className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg transition-all cursor-pointer"
              >
                Voltar
              </button>
            )}

            <div className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-zinc-900/60 hover:bg-zinc-900 transition-colors shrink-0 cursor-pointer">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-6 w-6"
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

        {/* Main Grid */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative md:flex-row">
        {/* Coluna 1: Mascote do Ratão Gigante (Apenas no Desktop) */}
        <div className="hidden md:flex flex-col items-center justify-end w-[280px] lg:w-[360px] shrink-0 border-r border-white/10 bg-black/20 p-6 overflow-hidden relative backdrop-blur-md">
          {/* Brilho verde de fundo */}
          <div className="absolute w-[80%] h-[80%] rounded-full bg-emerald-500/5 blur-[80px] -z-10 bottom-10" />
          
          <div className="w-full flex-1 flex flex-col justify-center max-w-[280px] opacity-90 animate-[fadeIn_0.5s_ease-out]">
            <h2 className="text-xl font-extrabold italic tracking-tight uppercase text-acid mb-1 text-center md:text-left">
              BORA FICAR GIGANTE!
            </h2>
            <p className="text-xs text-zinc-400 font-medium text-center md:text-left mb-6">
              Responda as perguntas ao lado para eu montar o seu planejamento de monstro.
            </p>
          </div>

          <div className="relative w-full max-w-[280px] aspect-square flex items-center justify-center">
            <img 
              src="/mascot.png" 
              alt="Mascote Ratão" 
              className="w-full h-auto max-h-[320px] object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.6)]"
              style={{
                transform: "scaleX(-1)",
                maskImage: "linear-gradient(to bottom, black 70%, transparent 96%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 96%)"
              }}
            />
          </div>
        </div>

        {/* Coluna Esquerda: Chat (Agora Coluna 2) */}
        <div className="flex min-h-0 flex-1 min-w-0 flex-col bg-black/30">
          {/* Corpo do chat */}
          <div ref={chatScrollRef} className="mobile-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-6 scrollbar-thin scrollbar-thumb-black/45">
            {messages.map((msg, idx) => {
              if (msg.content.startsWith("[Sistema")) return null; // Oculta logs de sistema
              const isAi = msg.role === "assistant";
              return (
                <div 
                  key={idx} 
                  className={`flex gap-3 max-w-[85%] ${isAi ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 overflow-hidden ${
                    isAi ? "border border-acid/30 bg-black" : "bg-zinc-800 text-zinc-300"
                  }`}>
                    {isAi ? (
                      <img 
                        src="/mascot.png" 
                        alt="Avatar Ratão" 
                        className="w-full h-full object-cover scale-x-[-1] scale-110" 
                      />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  
                  <div className={`flex flex-col gap-1`}>
                    {isAi && (
                      <span className="text-[9px] font-black text-acid tracking-wider uppercase mb-0.5 ml-1">
                        Ratão
                      </span>
                    )}
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      isAi 
                        ? "bg-graphite/90 text-zinc-200 rounded-tl-none border border-white/10" 
                        : "bg-acid/10 text-zinc-100 rounded-tr-none border border-acid/30 shadow-md shadow-acid/5 font-medium"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border border-acid/30 bg-black animate-pulse">
                  <img 
                    src="/mascot.png" 
                    alt="Avatar Ratão" 
                    className="w-full h-full object-cover scale-x-[-1] scale-110" 
                  />
                </div>
                <div className="px-4 py-3.5 rounded-2xl bg-graphite/90 border border-white/10 rounded-tl-none flex items-center gap-1.5 h-10 min-w-[56px] justify-center">
                  <span className="w-2 h-2 rounded-full bg-acid inline-block typing-dot" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-acid inline-block typing-dot" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-acid inline-block typing-dot" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            
          </div>

          {/* Área de Input */}
          <div className="shrink-0 border-t border-white/10 bg-black/30 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md">
            {uploadError && (
              <div className="mb-2 text-xs text-rose-500 bg-rose-950/20 border border-rose-900/30 px-3 py-2 rounded-lg">
                ⚠️ {uploadError}
              </div>
            )}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(input);
              }}
              className="flex items-center gap-2 bg-zinc-900/60 border border-white/10 rounded-xl p-1 focus-within:border-acid transition-all"
            >
              {/* Botão de Bioimpedância */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*" 
              />
              <button 
                type="button"
                disabled={isUploading || isTyping}
                onClick={() => fileInputRef.current?.click()}
                title="Anexar foto de exame de bioimpedância"
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-acid" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>

              <input 
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isUploading 
                    ? "Analisando exame..." 
                    : "Digite sua mensagem... (ex: 'Treino há 2 anos')"
                }
                disabled={isTyping || isUploading}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none px-2"
              />

              <button
                type="submit"
                disabled={!input.trim() || isTyping || isUploading}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-acid hover:opacity-90 text-black transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-2 text-center text-[10px] text-zinc-600">
              Dica: Anexe uma foto legível da sua bioimpedância para calcular a dieta automaticamente.
            </div>
          </div>
        </div>

        </div>

        {/* Modal de Preview (Minha Nova Rotina) */}
        {showPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-0 md:p-4 animate-[fadeIn_0.2s_ease-out]">
            <div 
              className="w-full h-dvh md:h-auto md:max-h-[90vh] md:max-w-md rounded-none md:rounded-3xl border-0 md:border border-white/10 p-6 shadow-2xl flex flex-col overflow-hidden relative z-10 text-zinc-100"
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
              {/* Título */}
              <div className="mb-4 flex items-center justify-between shrink-0">
                <h2 className="font-extrabold text-sm text-zinc-300 tracking-wide flex items-center gap-2 uppercase">
                  <Activity className="w-4 h-4 text-acid animate-pulse" />
                  Minha Nova Rotina
                </h2>
                <button
                  onClick={() => setShowPreview(false)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  aria-label="Fechar"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Cards de visualização */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-2 scrollbar-thin scrollbar-thumb-black/40">
                {Object.keys(previewData).length === 0 && (
                  <div className="h-48 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl text-zinc-600 px-8 text-center text-xs">
                    <Sparkles className="w-8 h-8 mb-2 text-zinc-700 animate-pulse" />
                    Converse com a IA ao lado para começar a montar o seu treino e plano alimentar automaticamente.
                  </div>
                )}

                {/* CARD 1: PERFIL & BIOMETRIA */}
                {(previewData.profile || previewData.biometrics) && (
                  <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <Scale className="w-3.5 h-3.5 text-zinc-500" />
                      Perfil e Composição Corporal
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {previewData.profile?.gender && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Gênero</div>
                          <div className="font-semibold text-zinc-200 capitalize">{previewData.profile.gender}</div>
                        </div>
                      )}
                      {previewData.profile?.age && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Idade</div>
                          <div className="font-semibold text-zinc-200">{previewData.profile.age} anos</div>
                        </div>
                      )}
                      {previewData.profile?.experience && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Experiência</div>
                          <div className="font-semibold text-zinc-200 capitalize">{previewData.profile.experience}</div>
                        </div>
                      )}
                      {previewData.profile?.trainingTime && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Tempo de Treino</div>
                          <div className="font-semibold text-zinc-200">{previewData.profile.trainingTime}</div>
                        </div>
                      )}
                      {previewData.profile?.trainingDaysPerWeek && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Treino/Semana</div>
                          <div className="font-semibold text-zinc-200">{previewData.profile.trainingDaysPerWeek} dias</div>
                        </div>
                      )}
                      {previewData.profile?.goal && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl col-span-2">
                          <div className="text-zinc-500 mb-0.5">Objetivo Principal</div>
                          <div className="font-semibold text-acid">{formatGoalLabel(previewData.profile.goal)}</div>
                        </div>
                      )}
                      {previewData.biometrics?.weight && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Peso</div>
                          <div className="font-bold text-zinc-200">{previewData.biometrics.weight} kg</div>
                        </div>
                      )}
                      {previewData.biometrics?.height && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Altura</div>
                          <div className="font-bold text-zinc-200">{previewData.biometrics.height} cm</div>
                        </div>
                      )}
                      {previewData.biometrics?.fatPct && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">% Gordura</div>
                          <div className="font-bold text-emerald-400">{previewData.biometrics.fatPct}%</div>
                        </div>
                      )}
                      {previewData.biometrics?.muscleMass && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                          <div className="text-zinc-500 mb-0.5">Massa Magra</div>
                          <div className="font-bold text-acid">{previewData.biometrics.muscleMass} kg</div>
                        </div>
                      )}
                      {previewData.biometrics?.tmb && (
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl col-span-2 flex items-center justify-between">
                          <div>
                            <div className="text-zinc-500 mb-0.5">Metabolismo Basal (TMB)</div>
                            <div className="font-extrabold text-cyan text-sm">{previewData.biometrics.tmb} kcal</div>
                          </div>
                          <Sparkles className="w-5 h-5 text-acid" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CARD 2: DIETA */}
                {previewData.diet && previewData.diet.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <Utensils className="w-3.5 h-3.5 text-zinc-500" />
                      Plano Alimentar Proposto
                    </h3>
                    <div className="space-y-4">
                      {previewData.diet.map((meal: any, idx: number) => {
                        const isOldFormat = !meal.items;
                        const mealName = isOldFormat ? "Refeição" : meal.name;
                        const items = isOldFormat ? [meal] : meal.items;
                        return (
                          <div key={idx} className="space-y-2">
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider pl-1.5 border-l-2 border-emerald-400">
                              {mealName}
                            </h4>
                            <div className="space-y-1.5">
                              {items.map((item: any, itemIdx: number) => (
                                <div key={itemIdx} className="bg-black/20 border border-white/5 p-2.5 rounded-xl flex justify-between items-start">
                                  <div className="space-y-0.5">
                                    <div className="text-[11px] font-bold text-zinc-300">{item.name}</div>
                                    <div className="text-[10px] text-zinc-400">{item.amount}</div>
                                  </div>
                                  {item.calories > 0 && (
                                    <span className="text-[9px] font-bold text-amber-500 bg-amber-950/20 border border-amber-900/30 px-2 py-0.5 rounded">
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

                {/* CARD 3: TREINO DE MUSCULAÇÃO */}
                {previewData.workouts && Object.keys(previewData.workouts).length > 0 && (
                  <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <Dumbbell className="w-3.5 h-3.5 text-zinc-500" />
                      Divisão de Treinos Musculação
                    </h3>
                    
                    {/* Abas das letras do treino */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {currentWorkoutsKeys.map((key) => (
                        <button
                          key={key}
                          onClick={() => setSelectedWorkoutTab(key)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 uppercase cursor-pointer ${
                            selectedWorkoutTab === key
                              ? "bg-acid text-black font-extrabold shadow-md shadow-acid/15"
                              : "bg-black/40 border border-white/5 text-zinc-400"
                          }`}
                        >
                          Treino {key}
                        </button>
                      ))}
                    </div>

                    {/* Exercícios da aba selecionada */}
                    <div className="space-y-2.5">
                      {previewData.workouts[selectedWorkoutTab]?.map((ex: any, idx: number) => (
                        <div key={idx} className="bg-black/20 border border-white/5 p-3 rounded-xl flex justify-between items-center">
                          <div className="space-y-0.5">
                            <div className="text-[11px] font-bold text-zinc-300">{ex.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              {ex.series} séries x {ex.reps} reps
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-acid bg-acid/10 border border-acid/20 px-2.5 py-1 rounded-lg">
                            {ex.load}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CARD 4: CARDIO */}
                {previewData.aerobic?.name && (
                  <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl space-y-3">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <Timer className="w-3.5 h-3.5 text-zinc-500" />
                      Exercício Aeróbico
                    </h3>
                    <div className="bg-black/20 border border-white/5 p-3.5 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-zinc-300">{previewData.aerobic.name}</div>
                        <div className="text-[10px] text-zinc-500">Intensidade moderada / leve</div>
                      </div>
                      <span className="text-xs font-extrabold text-amber-500 bg-amber-950/20 border border-amber-900/30 px-3 py-1 rounded-lg">
                        {previewData.aerobic.duration} min
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Feedback de salvamento automático */}
        {isSaving && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-acid mb-3" />
            <p className="text-sm font-bold text-zinc-300">Gravando seu plano de monstro...</p>
          </div>
        )}
      </section>
    </main>
  );
}
