import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ExplanationCardProps {
  content: string;
  className?: string;
}

export function ExplanationCard({ content, className }: ExplanationCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-primary/30 bg-primary/5 dark:bg-primary/10 overflow-hidden",
        className
      )}
      data-testid="explanation-card"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/15">
        <BookOpen className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-primary">Case Explanation</span>
      </div>
      <div className="p-4">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:my-2 prose-headings:font-semibold prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:font-semibold prose-code:bg-background/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs text-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
