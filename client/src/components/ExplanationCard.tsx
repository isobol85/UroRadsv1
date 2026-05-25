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
        "rounded-2xl border border-card-border bg-card shadow-sm overflow-hidden",
        className
      )}
      data-testid="explanation-card"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-card-border bg-primary/[0.04] dark:bg-primary/10">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary">
          <BookOpen className="w-3.5 h-3.5" />
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-foreground">Case Explanation</span>
      </div>
      <div className="p-5">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-tight prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:font-semibold prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs text-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
