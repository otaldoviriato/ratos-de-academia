import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Por favor, adicione a variável OPENAI_API_KEY ao seu arquivo .env ou .env.local");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
