import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";

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
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {content}
        </p>
      </div>
    </div>
  );
}
