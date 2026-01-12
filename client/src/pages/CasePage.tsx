import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Send, ChevronRight, ChevronUp, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaseImage } from "@/components/CaseImage";
import { ChatBubble } from "@/components/ChatBubble";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Case, ChatMessage } from "@shared/schema";

type ViewMode = "image" | "read";

export default function CasePage() {
  const [, params] = useRoute("/case/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const caseId = params?.id;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useState<ViewMode>("image");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: cases = [], isLoading: casesLoading } = useQuery<Case[]>({
    queryKey: ["/api/cases"],
  });

  const currentCase = caseId 
    ? cases.find(c => c.id === caseId)
    : cases[0];

  const { data: storedMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/cases", currentCase?.id, "messages"],
    enabled: !!currentCase?.id,
  });

  const storedMessagesKey = storedMessages.map(m => m.id).join(",");
  useEffect(() => {
    setMessages(storedMessages);
  }, [storedMessagesKey]);

  useEffect(() => {
    if (mode === "read" && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 350);
      }
    }
  }, [messages, mode]);

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

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        explanation: currentCase!.explanation,
        chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
        userMessage,
      });
      return response.json() as Promise<{ response: string }>;
    },
    onSuccess: async (data) => {
      await apiRequest("POST", `/api/cases/${currentCase!.id}/messages`, {
        role: "ai",
        content: data.response,
      });
      
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        caseId: currentCase!.id,
        role: "ai",
        content: data.response,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      queryClient.invalidateQueries({ queryKey: ["/api/cases", currentCase?.id, "messages"] });
    },
    onError: () => {
      toast({
        title: "Response failed",
        description: "Could not get an AI response. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = chatMutation.isPending;

  const handleModeChange = (newMode: ViewMode) => {
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
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

    const userInput = inputValue.trim();
    
    await apiRequest("POST", `/api/cases/${currentCase.id}/messages`, {
      role: "user",
      content: userInput,
    });

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      caseId: currentCase.id,
      role: "user",
      content: userInput,
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    
    if (mode === "image") {
      handleModeChange("read");
    }
    
    chatMutation.mutate(userInput);
  };

  const handleNextCase = () => {
    const currentIndex = cases.findIndex(c => c.id === currentCase.id);
    const nextIndex = (currentIndex + 1) % cases.length;
    const nextCase = cases[nextIndex];
    setMode("image");
    setIsTransitioning(false);
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
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold" data-testid="text-app-title">UroRads</h1>
          <span className="text-sm text-muted-foreground" data-testid="text-case-number">
            Case #{currentCase.caseNumber}
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleNextCase}
          className="gap-1"
          data-testid="button-next-case"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </header>

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
          onTransitionEnd={isImageMode ? handleTransitionEnd : undefined}
        >
          <div className="flex-1 flex flex-col p-4 min-h-0">
            {currentCase.mediaType === "video" && currentCase.videoUrl ? (
              <div className="flex-1 flex items-center justify-center rounded-md overflow-hidden bg-black/5 dark:bg-white/5">
                <video
                  src={`/api/videos/${currentCase.id}/stream`}
                  controls
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
            className="shrink-0 h-12 flex items-center justify-center gap-2 bg-card border-t border-border"
            data-testid="button-expand-read"
          >
            <ChevronUp className="w-5 h-5 text-foreground" />
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
          onTransitionEnd={!isImageMode ? handleTransitionEnd : undefined}
        >
          {!isKeyboardVisible && (
            <button
              onClick={() => handleModeChange("image")}
              disabled={isTransitioning}
              className="shrink-0 p-3 border-b border-border hover-elevate active-elevate-2 transition-all"
              data-testid="button-thumbnail"
            >
              <div className="flex items-center gap-3">
                <div className="w-20 h-14 bg-muted border border-border rounded-md overflow-hidden shrink-0 relative">
                  <img
                    src={currentCase.imageUrl}
                    alt={currentCase.title}
                    className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
                  />
                  {currentCase.mediaType === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
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
            <div className="space-y-3 py-4">
              <ChatBubble role="ai" content={currentCase.explanation} />
              
              {messages.map((message) => (
                <ChatBubble 
                  key={message.id} 
                  role={message.role as "ai" | "user"} 
                  content={message.content} 
                />
              ))}
              
              {isLoading && (
                <div className="flex justify-start" data-testid="chat-loading">
                  <div className="bg-muted rounded-2xl rounded-tl-sm p-4">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="shrink-0 p-3 border-t border-border bg-background">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                disabled={isLoading}
                rows={1}
                data-testid="input-chat"
              />
              <Button 
                size="icon" 
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
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
