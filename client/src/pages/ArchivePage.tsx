import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { FolderOpen, Loader2, Trash2, Pencil, Search, MessageSquare, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";
import { LoadingPearls } from "@/components/LoadingPearls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/hooks/use-auth";

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

function getCategoryColor(_category: string): string {
  // Clinical & Calm: categorical labels use a single tokenized neutral chip.
  // The text content already identifies the category; differentiation by hue
  // would fight the calm palette.
  return "bg-muted text-foreground/75 border border-card-border";
}

interface SwipeableCaseItemProps {
  case_: Case;
  canEdit: boolean;
  onDeleteClick: (case_: Case) => void;
  onEditClick: (case_: Case) => void;
}

function SwipeableCaseItem({ case_, canEdit, onDeleteClick, onEditClick }: SwipeableCaseItemProps) {
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
      <div className="w-12 h-12 rounded-xl bg-muted border border-card-border flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
        <img
          src={case_.imageUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-foreground font-display text-tabular" data-testid={`text-case-number-${case_.id}`}>
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
        
        {canEdit && (
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
        )}
      </div>
    );
  }

  // Non-draggable version if user can't edit
  if (!canEdit) {
    return (
      <div className="relative border-b border-border">
        <Link href={`/case/${case_.id}`}>
          {caseContent}
        </Link>
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
  const [location, navigate] = useLocation();
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, isAuthenticated } = useAuth();

  const createdByFilter = useMemo(() => {
    const queryString = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(queryString);
    return params.get("createdBy");
  }, [location]);

  const { data: users = [] } = useQuery<Array<{ id: string; displayName: string | null; firstName: string | null; lastName: string | null; email: string | null }>>({
    queryKey: ["/api/admin/users"],
    enabled: !!createdByFilter && !!user?.isAdmin,
  });

  const filterUser = useMemo(() => {
    if (!createdByFilter) return null;
    return users.find((u) => u.id === createdByFilter) ?? null;
  }, [createdByFilter, users]);

  const { data: cases = [], isLoading } = useQuery<Case[]>({
    queryKey: ["/api/cases"],
  });

  const trimmedQuery = searchQuery.trim();
  const [debouncedChatQuery, setDebouncedChatQuery] = useState(trimmedQuery);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedChatQuery(trimmedQuery);
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  const baselineCases = useMemo(() => {
    if (!createdByFilter) return cases;
    return cases.filter((c) => c.createdBy === createdByFilter);
  }, [cases, createdByFilter]);

  const filteredCases = useMemo(() => {
    if (!trimmedQuery) return baselineCases;
    const q = trimmedQuery.toLowerCase();
    return baselineCases.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        String(c.caseNumber).includes(q),
    );
  }, [baselineCases, trimmedQuery]);

  const { data: matchingChats = [] } = useQuery<
    Array<{ id: string; caseId: string; title: string | null; caseName: string }>
  >({
    queryKey: ["/api/chat-sessions/search", debouncedChatQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/chat-sessions/search?q=${encodeURIComponent(debouncedChatQuery)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && debouncedChatQuery.length > 0,
  });

  // Calculate if user can edit a case: must be owner or admin
  const canEditCase = (case_: Case): boolean => {
    if (!isAuthenticated || !user) return false;
    const isOwner = case_.createdBy === user.id;
    const isAdmin = user.isAdmin === true;
    return isOwner || isAdmin;
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cases/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.setQueryData<Case[]>(["/api/cases"], (oldCases) => {
        return oldCases ? oldCases.filter((c) => c.id !== deletedId) : [];
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
        <header className="flex items-center px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
          <span className="flex h-7 w-7 mr-2 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="w-4 h-4" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-archive-title">Archive</h1>
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
        <header className="flex items-center px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
          <span className="flex h-7 w-7 mr-2 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="w-4 h-4" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-archive-title">Archive</h1>
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
      <header className="flex items-center justify-between px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
        <div className="flex items-center">
          <span className="flex h-7 w-7 mr-2 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="w-4 h-4" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-archive-title">Archive</h1>
        </div>
        <span className="text-[12px] font-medium text-muted-foreground text-tabular" data-testid="text-case-count">
          {trimmedQuery
            ? `${filteredCases.length} of ${baselineCases.length}`
            : `${baselineCases.length} ${baselineCases.length === 1 ? "case" : "cases"}`}
        </span>
      </header>

      {createdByFilter && (
        <div
          className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/40"
          data-testid="banner-creator-filter"
        >
          <span className="text-xs text-muted-foreground truncate">
            Showing cases created by{" "}
            <span className="font-medium text-foreground" data-testid="text-creator-filter-name">
              {filterUser
                ? filterUser.displayName ||
                  ([filterUser.firstName, filterUser.lastName].filter(Boolean).join(" ") ||
                    filterUser.email ||
                    "this user")
                : "this user"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => navigate("/archive")}
            className="text-xs text-primary hover:underline shrink-0"
            data-testid="button-clear-creator-filter"
          >
            Clear
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-b border-card-border shrink-0 bg-background">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cases by title or category..."
            className="pl-9 pr-9 h-10 rounded-xl bg-muted/40 border-transparent focus-visible:bg-card focus-visible:border-input"
            data-testid="input-archive-search"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              data-testid="button-clear-search"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="pb-20">
          {filteredCases.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="text-no-results">
              No cases match "{trimmedQuery}"
            </div>
          ) : (
            filteredCases.map((case_) => (
              <SwipeableCaseItem
                key={case_.id}
                case_={case_}
                canEdit={canEditCase(case_)}
                onDeleteClick={handleDeleteClick}
                onEditClick={handleEditClick}
              />
            ))
          )}

          {isAuthenticated && trimmedQuery && matchingChats.length > 0 && (
            <div className="mt-4 border-t border-border">
              <div className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Matching chats
              </div>
              {matchingChats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/case/${chat.caseId}?view=read`}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border hover-elevate active-elevate-2"
                  data-testid={`chat-result-${chat.id}`}
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {chat.title || "Untitled chat"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {chat.caseName}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
