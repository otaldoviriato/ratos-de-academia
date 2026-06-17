import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Pula arquivos internos do Next.js e todos os arquivos estáticos, exceto se encontrados nos parâmetros de busca
    "/((?!_next|[^?]*\\.[\\w]+$|_next/image|_next/static|favicon.ico).*)",
    // Sempre executa para rotas de API
    "/(api|trpc)(.*)",
  ],
};
