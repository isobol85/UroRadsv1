import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Send, ChevronRight, ChevronUp, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaseImage } from "@/components/CaseImage";
import { ChatBubble } from "@/components/ChatBubble";
import { ExplanationCard } from "@/components/ExplanationCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingPearls } from "@/components/LoadingPearls";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useUrlMode } from "@/hooks/use-url-mode";
import { cn } from "@/lib/utils";
import { getChatMessages, saveChatMessage, cleanupExpiredChats, type LocalChatMessage } from "@/lib/chatStorage";
import type { Case } from "@shared/schema";

interface ChatSession {
  id: string;
  caseId: string;
  userId: string;
  title: string | null;
}

interface DbChatMessage {
  id: string;
  sessionId: string | null;
  caseId: string;
  role: "user" | "ai";
  content: string;
  createdAt: string;
}

export default function CasePage() {
  const [, params] = useRoute("/case/:id");
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const caseId = params?.id;
  
  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useUrlMode(location, "image");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: cases = [], isLoading: casesLoading } = useQuery<Case[]>({
    queryKey: ["/api/cases"],
  });

  const currentCase = caseId 
    ? cases.find(c => c.id === caseId)
    : cases[0];

  const { data: dbMessages = [], isLoading: messagesLoading } = useQuery<DbChatMessage[]>({
    queryKey: ["/api/chat-sessions", currentSession?.id, "messages"],
    queryFn: async () => {
      if (!currentSession?.id) return [];
      const res = await fetch(`/api/chat-sessions/${currentSession.id}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && !!currentSession?.id,
  });

  useEffect(() => {
    cleanupExpiredChats();
  }, []);

  // Set up chat session when case changes
  useEffect(() => {
    if (!currentCase?.id) {
      setLocalMessages([]);
      setCurrentSession(null);
      setSessionStatus("idle");
      return;
    }

    let cancelled = false;
    if (isAuthenticated) {
      // Reset session state while we look it up so the render uses
      // server-source (loading) instead of local-cache fallback.
      setCurrentSession(null);
      setSessionStatus("loading");
      setLocalMessages([]);
      fetch(`/api/cases/${currentCase.id}/chat-session`, {
        method: "POST",
        credentials: "include",
      })
        .then(res => (res.ok ? res.json() : null))
        .then(session => {
          if (cancelled) return;
          if (session) {
            setCurrentSession(session);
            setSessionStatus("ready");
          } else {
            setCurrentSession(null);
            setSessionStatus("failed");
            setLocalMessages(getChatMessages(currentCase.id));
          }
        })
        .catch(() => {
          if (cancelled) return;
          setCurrentSession(null);
          setSessionStatus("failed");
          setLocalMessages(getChatMessages(currentCase.id));
        });
    } else {
      setCurrentSession(null);
      setSessionStatus("idle");
      setLocalMessages(getChatMessages(currentCase.id));
    }
    setIsTransitioning(false);
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    return () => {
      cancelled = true;
    };
    // Intentionally NOT including `location` — mode toggles update the URL
    // query (?view=read) and must not re-bootstrap the chat session, which
    // would briefly blank the message list.
  }, [currentCase?.id, isAuthenticated]);

  useEffect(() => {
    if (mode === "read" && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 350);
      }
    }
  }, [localMessages, dbMessages, mode]);

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        setIsKeyboardVisible(windowHeight - viewportHeight > 150);
      }
    };

    window.visualViewport?.addEventListener("resize", handleResize);
    return () => window.visualViewport?.removeEventListener("resize", handleResize);
  }, []);

  // Single source of truth per render. While the authenticated session is
  // bootstrapping (loading), we render the server source as empty rather than
  // briefly swapping to the local cache and back — that was the source of the
  // flicker. We only fall back to local when truly unauthenticated, or when
  // the server session lookup explicitly failed.
  const useServerMessages =
    isAuthenticated && (sessionStatus === "loading" || sessionStatus === "ready");
  const messages: LocalChatMessage[] = useServerMessages
    ? dbMessages.map(m => ({
        id: m.id,
        caseId: m.caseId,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.createdAt).getTime(),
      }))
    : localMessages;

  const chatMutation = useMutation({
    mutationFn: async ({ userMessage, currentMessages }: { userMessage: string; currentMessages: LocalChatMessage[] }) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        explanation: currentCase!.explanation,
        chatHistory: currentMessages.map(m => ({ role: m.role, content: m.content })),
        userMessage,
      });
      return response.json() as Promise<{ response: string }>;
    },
    onSuccess: async (data) => {
      if (isAuthenticated && currentSession) {
        await apiRequest("POST", `/api/cases/${currentCase!.id}/messages`, {
          sessionId: currentSession.id,
          role: "ai",
          content: data.response,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/chat-sessions", currentSession.id, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/chat-sessions"] });
      } else {
        const aiMessage = saveChatMessage(currentCase!.id, {
          role: "ai",
          content: data.response,
        });
        setLocalMessages(prev => [...prev, aiMessage]);
      }
    },
    onError: () => {
      toast({
        title: "Response failed",
        description: "Could not get an AI response. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = chatMutation.isPending || messagesLoading;

  const handleModeChange = (newMode: "image" | "read") => {
    if (isTransitioning || mode === newMode) return;
    setIsTransitioning(true);
    setMode(newMode);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  if (casesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingPearls />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <EmptyState
        title="No cases yet"
        description="Be the first to add a teaching case!"
        actionLabel="Add Case"
        actionPath="/add"
      />
    );
  }

  if (!currentCase) {
    return (
      <EmptyState
        title="Case not found"
        description="This case doesn't exist or has been removed."
        actionLabel="Browse Archive"
        actionPath="/archive"
      />
    );
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    // Don't allow sending while the authenticated chat session is still
    // bootstrapping — otherwise the message would be written to the local
    // cache and then disappear once the server session resolves.
    if (isAuthenticated && sessionStatus === "loading") return;

    const userInput = inputValue.trim();
    
    let userMessage: LocalChatMessage;
    
    if (isAuthenticated && currentSession) {
      await apiRequest("POST", `/api/cases/${currentCase.id}/messages`, {
        sessionId: currentSession.id,
        role: "user",
        content: userInput,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chat-sessions", currentSession.id, "messages"] });
      
      userMessage = {
        id: Date.now().toString(),
        role: "user",
        content: userInput,
        timestamp: Date.now(),
      };
    } else {
      userMessage = saveChatMessage(currentCase.id, {
        role: "user",
        content: userInput,
      });
      setLocalMessages(prev => [...prev, userMessage]);
    }

    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    
    if (mode === "image") {
      handleModeChange("read");
    }
    
    chatMutation.mutate({ userMessage: userInput, currentMessages: [...messages, userMessage] });
  };

  const handleNextCase = () => {
    const currentIndex = cases.findIndex(c => c.id === currentCase.id);
    const nextIndex = (currentIndex + 1) % cases.length;
    const nextCase = cases[nextIndex];
    setMode("image");
    setIsTransitioning(false);
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    navigate(`/case/${nextCase.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const isImageMode = mode === "image";

  return (
    <div className="flex flex-col h-full">
      <div 
        ref={containerRef}
        className="flex-1 flex flex-col min-h-0 overflow-hidden relative"
      >
        <div 
          className={cn(
            "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out bg-background",
            isImageMode 
              ? "opacity-100 translate-y-0 pointer-events-auto z-10" 
              : "opacity-0 -translate-y-4 pointer-events-none z-0"
          )}
          aria-hidden={!isImageMode}
          onTransitionEnd={isImageMode ? handleTransitionEnd : undefined}
        >
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
            <span className="text-sm font-medium text-muted-foreground font-display text-tabular" data-testid="text-case-number">
              Case #{currentCase.caseNumber}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextCase}
              className="gap-1 h-8 pressable rounded-full"
              data-testid="button-next-case"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 flex flex-col px-4 pb-4 min-h-0">
            {currentCase.mediaType === "video" && currentCase.videoUrl ? (
              <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-card-border shadow-sm">
                <video
                  src={`/api/videos/${currentCase.id}/stream`}
                  controls
                  playsInline
                  preload="metadata"
                  poster={currentCase.imageUrl}
                  className="max-w-full max-h-full object-contain"
                  data-testid="video-player"
                />
              </div>
            ) : (
              <CaseImage 
                src={currentCase.imageUrl} 
                alt={currentCase.title}
                fillHeight
              />
            )}
            <p className="mt-2 text-sm font-medium text-center text-muted-foreground shrink-0" data-testid="text-case-title">
              {currentCase.title}
            </p>
          </div>
          
          <button
            onClick={() => handleModeChange("read")}
            disabled={isTransitioning}
            className="shrink-0 h-12 flex items-center justify-center gap-2 app-shell-surface border-t border-card-border hover-elevate active-elevate-2"
            data-testid="button-expand-read"
          >
            <ChevronUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Read explanation</span>
          </button>
        </div>

        <div 
          className={cn(
            "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out bg-background",
            !isImageMode 
              ? "opacity-100 translate-y-0 pointer-events-auto z-10" 
              : "opacity-0 translate-y-4 pointer-events-none z-0"
          )}
          aria-hidden={isImageMode}
          onTransitionEnd={!isImageMode ? handleTransitionEnd : undefined}
        >
          {!isKeyboardVisible && (
            <button
              onClick={() => handleModeChange("image")}
              disabled={isTransitioning}
              className="shrink-0 p-3 border-b border-card-border hover-elevate active-elevate-2 transition-all"
              data-testid="button-thumbnail"
            >
              <div className="flex items-center gap-3">
                <div className="w-20 h-14 bg-black border border-card-border rounded-xl overflow-hidden shrink-0 relative shadow-sm">
                  <img
                    src={currentCase.imageUrl}
                    alt={currentCase.title}
                    className="w-full h-full object-contain"
                  />
                  {currentCase.mediaType === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Video className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium" data-testid="text-thumbnail-title">
                    {currentCase.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentCase.mediaType === "video" ? "Tap to view video" : "Tap to view image"}
                  </p>
                </div>
              </div>
            </button>
          )}

          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="space-y-4 py-4">
              <ExplanationCard content={currentCase.explanation} />
              
              {messages.length > 0 && (
                <div className="space-y-3 pt-2">
                  {messages.map((message) => (
                    <ChatBubble 
                      key={message.id} 
                      role={message.role} 
                      content={message.content} 
                    />
                  ))}
                </div>
              )}
              
              {isLoading && (
                <div className="flex justify-start animate-fade-up" data-testid="chat-loading">
                  <div className="bg-accent-ai border border-accent-ai rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "0ms", backgroundColor: "hsl(var(--accent-ai))" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "150ms", backgroundColor: "hsl(var(--accent-ai))" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "300ms", backgroundColor: "hsl(var(--accent-ai))" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="shrink-0 p-3 border-t border-card-border bg-background">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2 rounded-xl bg-muted/40 border-transparent focus-visible:bg-card focus-visible:border-input"
                disabled={isLoading || (isAuthenticated && sessionStatus === "loading")}
                rows={1}
                data-testid="input-chat"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading || (isAuthenticated && sessionStatus === "loading")}
                className="rounded-full h-10 w-10 shadow-sm shrink-0"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
