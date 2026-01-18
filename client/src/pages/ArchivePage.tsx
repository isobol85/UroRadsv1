import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { FolderOpen, Loader2, Trash2, Pencil } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";
import { LoadingPearls } from "@/components/LoadingPearls";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import type { Case } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  
  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0
      );
    };
    checkTouch();
  }, []);
  
  return isTouch;
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    "Stones": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    "Hydronephrosis": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    "Mass/Tumor": "bg-red-500/10 text-red-600 dark:text-red-400",
    "Infection": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    "Trauma": "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    "Congenital": "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    "Vascular": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    "Bladder": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    "Prostate": "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    "Other": "bg-muted text-muted-foreground",
  };
  return colors[category] || "bg-muted text-muted-foreground";
}

interface SwipeableCaseItemProps {
  case_: Case;
  onDeleteClick: (case_: Case) => void;
  onEditClick: (case_: Case) => void;
}

function SwipeableCaseItem({ case_, onDeleteClick, onEditClick }: SwipeableCaseItemProps) {
  const isTouch = useIsTouchDevice();
  const x = useMotionValue(0);
  const actionOpacity = useTransform(x, [-60, 0], [1, 0]);
  const actionScale = useTransform(x, [-60, 0], [1, 0.5]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.x < -60) {
      x.set(-112);
      setIsOpen(true);
    } else {
      x.set(0);
      setIsOpen(false);
    }
  };

  const handleTrashClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(case_);
    x.set(0);
    setIsOpen(false);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEditClick(case_);
    x.set(0);
    setIsOpen(false);
  };

  const caseContent = (
    <div 
      className="flex items-center gap-4 px-4 py-4 hover-elevate active-elevate-2 cursor-pointer"
      data-testid={`archive-item-${case_.id}`}
    >
      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        <img 
          src={case_.imageUrl} 
          alt="" 
          className="w-full h-full object-cover"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-bold text-foreground" data-testid={`text-case-number-${case_.id}`}>
            Case #{case_.caseNumber}
          </span>
          <span 
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCategoryColor(case_.category)}`}
            data-testid={`badge-category-${case_.id}`}
          >
            {case_.category}
          </span>
        </div>
        <p 
          className="text-sm text-muted-foreground truncate"
          data-testid={`text-title-${case_.id}`}
        >
          {case_.title}
        </p>
      </div>
    </div>
  );

  if (!isTouch) {
    return (
      <div 
        className="relative border-b border-border group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link href={`/case/${case_.id}`}>
          {caseContent}
        </Link>
        
        <div 
          className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-all duration-200 ${
            isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
          }`}
          style={{ visibility: isHovered ? 'visible' : 'hidden' }}
        >
          <Button
            size="icon"
            variant="outline"
            onClick={handleEditClick}
            data-testid={`button-edit-${case_.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            onClick={handleTrashClick}
            data-testid={`button-delete-${case_.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden border-b border-border">
      <motion.div
        className="absolute right-0 top-0 bottom-0 flex items-center"
        style={{ opacity: actionOpacity }}
      >
        <motion.div style={{ scale: actionScale }} className="flex">
          <div className="w-14 h-full flex items-center justify-center bg-primary">
            <Button
              size="icon"
              variant="ghost"
              className="text-primary-foreground"
              onClick={handleEditClick}
              data-testid={`button-edit-${case_.id}`}
            >
              <Pencil className="w-5 h-5" />
            </Button>
          </div>
          <div className="w-14 h-full flex items-center justify-center bg-destructive">
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive-foreground"
              onClick={handleTrashClick}
              data-testid={`button-delete-${case_.id}`}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -112, right: 0 }}
        dragElastic={0.5}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="bg-background"
      >
        <Link 
          href={`/case/${case_.id}`}
          onClick={(e) => isDragging && e.preventDefault()}
        >
          {caseContent}
        </Link>
      </motion.div>
    </div>
  );
}

export default function ArchivePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);

  const { data: cases = [], isLoading } = useQuery<Case[]>({
    queryKey: ["/api/cases"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cases/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.setQueryData<Case[]>(["/api/cases"], (oldCases) => {
        return oldCases ? oldCases.filter((c) => c.id !== deletedId) : [];
      });
      toast({
        title: "Case deleted",
        description: "The case has been permanently removed from the archive.",
      });
      setCaseToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the case. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (case_: Case) => {
    setCaseToDelete(case_);
  };

  const handleEditClick = (case_: Case) => {
    navigate(`/edit/${case_.id}`);
  };

  const confirmDelete = () => {
    if (caseToDelete) {
      deleteMutation.mutate(caseToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center px-4 h-14 border-b border-border shrink-0">
          <FolderOpen className="w-5 h-5 mr-2 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-archive-title">Archive</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <LoadingPearls />
        </div>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center px-4 h-14 border-b border-border shrink-0">
          <FolderOpen className="w-5 h-5 mr-2 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-archive-title">Archive</h1>
        </header>
        <EmptyState
          title="The archive is empty"
          description="Add your first case to start building the library!"
          actionLabel="Add Case"
          actionPath="/add"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center">
          <FolderOpen className="w-5 h-5 mr-2 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-archive-title">Archive</h1>
        </div>
        <span className="text-sm text-muted-foreground" data-testid="text-case-count">
          {cases.length} {cases.length === 1 ? "case" : "cases"}
        </span>
      </header>

      <ScrollArea className="flex-1">
        <div className="pb-20">
          {cases.map((case_) => (
            <SwipeableCaseItem 
              key={case_.id} 
              case_={case_} 
              onDeleteClick={handleDeleteClick}
              onEditClick={handleEditClick}
            />
          ))}
        </div>
      </ScrollArea>

      <AlertDialog open={!!caseToDelete} onOpenChange={(open) => !open && setCaseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-delete-title">Delete Case?</AlertDialogTitle>
            <AlertDialogDescription data-testid="dialog-delete-description">
              Are you sure you want to permanently delete Case #{caseToDelete?.caseNumber}? 
              This action cannot be undone and all associated data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground border-destructive-border"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
