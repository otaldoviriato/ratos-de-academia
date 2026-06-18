import { auth } from "@clerk/nextjs/server";
import { openai } from "../../../../lib/openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Aceita apenas imagens mais comuns
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado. Por favor, envie uma imagem (JPG, PNG ou WEBP) do seu exame." },
        { status: 400 }
      );
    }

    // Converte o arquivo para Buffer e depois para base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analise cuidadosamente esta imagem de exame de bioimpedância (comum da InBody ou similar) e extraia com precisão os seguintes dados biométricos:

1. "weight": Peso corporal em kg (ex: na imagem pode constar na tabela de Composição Corporal sob a linha "Peso"). Extraia o número em kg (ex: 74.4).
2. "height": Altura em cm (geralmente fica no cabeçalho superior, ex: 170.0). Extraia apenas o número em cm (ex: 170).
3. "fatPct": Percentual de gordura corporal em % (procure por "Gordura Corporal" ou "Percentual de Gordura Corporal" na tabela de Diagnóstico de Obesidade. Extraia o valor em percentual %, ex: 21.9).
4. "muscleMass": Massa muscular esquelética em kg (procure por "Músculo Esquelético" ou "Massa de Músculo Esquelético" em kg. ATENÇÃO: Extraia o valor correspondente a KG, e não a porcentagem %. Ex: se for 29.0 kg, o valor é 29.0).
5. "tmb": Metabolismo Basal ou Taxa Metabólica Basal em kcal (procure por "Metabolismo Basal" na tabela. Extraia apenas o número em kcal, ex: 1713).

Retorne obrigatoriamente um objeto JSON contendo exatamente as chaves: "weight", "height", "fatPct", "muscleMass" e "tmb".
Se algum destes dados não for encontrado de forma clara na imagem, defina o valor da respectiva chave como null.
Retorne apenas o JSON puro, sem blocos de código markdown.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.type};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0.2,
    });

    const contentText = response.choices[0].message?.content || "{}";
    const extractedData = JSON.parse(contentText);

    return NextResponse.json({ success: true, data: extractedData });
  } catch (error: any) {
    console.error("Erro no processamento de upload de bioimpedância:", error);
    return NextResponse.json({ error: "Erro ao analisar o arquivo de bioimpedância" }, { status: 500 });
  }
}
