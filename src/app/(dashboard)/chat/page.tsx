import { ChatCard } from "@/components/chat/ChatCard";

/**
 * Página do chat com a One — `<ChatCard />` agora é um layout de 2 colunas
 * (sidebar de conversas + área principal) em telas desktop, então o
 * container ficou mais largo que a versão de card único anterior; o
 * título "Assistente One" mora dentro do próprio `ChatCard` agora (junto
 * com o `OneIcon` de status), não repetido aqui.
 */
export default function ChatPage() {
  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-8">
      <ChatCard />
    </main>
  );
}
