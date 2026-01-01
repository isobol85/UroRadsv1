import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  role: "ai" | "user";
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  const isAI = role === "ai";
  
  return (
    <div
      className={cn(
        "flex w-full",
        isAI ? "justify-start" : "justify-end"
      )}
      data-testid={`chat-bubble-${role}`}
    >
      <div
        className={cn(
          "max-w-[85%] p-4 text-sm leading-relaxed",
          isAI 
            ? "bg-muted text-foreground rounded-2xl rounded-tl-sm" 
            : "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
