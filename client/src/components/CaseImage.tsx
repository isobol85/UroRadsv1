import { cn } from "@/lib/utils";

interface CaseImageProps {
  src: string;
  alt: string;
  className?: string;
  fillHeight?: boolean;
}

export function CaseImage({ src, alt, className, fillHeight = false }: CaseImageProps) {
  if (fillHeight) {
    return (
      <div 
        className={cn(
          "flex-1 flex items-center justify-center min-h-0",
          className
        )}
        data-testid="case-image-container"
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain"
          data-testid="case-image"
        />
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "w-full bg-muted border border-border rounded-lg overflow-hidden",
        className
      )}
      data-testid="case-image-container"
    >
      <div className="aspect-[4/3] relative">
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-contain bg-black/5 dark:bg-white/5"
          data-testid="case-image"
        />
      </div>
    </div>
  );
}
