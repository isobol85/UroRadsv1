import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, ImageIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
}

export function EmptyState({ title, description, actionLabel, actionPath }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center"
      data-testid="empty-state"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" aria-hidden="true" />
        <div className="relative w-20 h-20 rounded-full bg-card border border-card-border shadow-sm flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-primary/70" strokeWidth={1.5} />
        </div>
      </div>
      <h2 className="text-xl font-semibold tracking-tight mb-2" data-testid="empty-state-title">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-xs leading-relaxed" data-testid="empty-state-description">
        {description}
      </p>
      {actionLabel && actionPath && (
        <Link href={actionPath}>
          <Button className="rounded-full px-5 shadow-sm" data-testid="empty-state-action">
            <Plus className="w-4 h-4 mr-2" />
            {actionLabel}
          </Button>
        </Link>
      )}
    </div>
  );
}
