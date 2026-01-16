import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

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
        {isAI ? (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:my-2 prose-headings:font-semibold prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:font-semibold prose-code:bg-background/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}
