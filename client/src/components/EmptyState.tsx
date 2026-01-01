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
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2" data-testid="empty-state-title">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-xs" data-testid="empty-state-description">
        {description}
      </p>
      {actionLabel && actionPath && (
        <Link href={actionPath}>
          <Button data-testid="empty-state-action">
            <Plus className="w-4 h-4 mr-2" />
            {actionLabel}
          </Button>
        </Link>
      )}
    </div>
  );
}
