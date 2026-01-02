import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Check, ChevronUp, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaseImage } from "@/components/CaseImage";
import { ChatBubble } from "@/components/ChatBubble";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, useParams, Link } from "wouter";
import { cn } from "@/lib/utils";
import type { Case } from "@shared/schema";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
}

interface AnalyzeResponse {
  explanation: string;
  title: string;
  category: string;
}

type ViewMode = "image" | "read";

export default function EditCasePage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentExplanation, setCurrentExplanation] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCategory, setCurrentCategory] = useState("");
  const [mode, setMode] = useState<ViewMode>("read");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: caseData, isLoading: isCaseLoading } = useQuery<Case>({
    queryKey: ["/api/cases", id],
  });

  useEffect(() => {
    if (caseData && !isInitialized) {
      setCurrentExplanation(caseData.explanation);
      setCurrentTitle(caseData.title);
      setCurrentCategory(caseData.category);
      setMessages([{
        id: `msg-initial`,
        role: "ai",
        content: `Current explanation for this case:\n\n${caseData.explanation}\n\nHow would you like me to refine this explanation?`
      }]);
      setIsInitialized(true);
    }
  }, [caseData, isInitialized]);

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

  const refineMutation = useMutation({
    mutationFn: async (data: { imageBase64: string; currentExplanation: string; feedback: string }) => {
      const response = await apiRequest("POST", "/api/ai/refine", data);
      return response.json() as Promise<AnalyzeResponse>;
    },
    onSuccess: (data) => {
      setCurrentExplanation(data.explanation);
      setCurrentTitle(data.title);
      setCurrentCategory(data.category);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: "ai",
        content: `I've updated the explanation based on your feedback:\n\n${data.explanation}\n\nLet me know if you'd like any more changes, or click "Save Changes" when ready.`
      }]);
    },
    onError: () => {
      toast({
        title: "Refinement failed",
        description: "Could not refine the explanation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/cases/${id}`, {
        title: currentTitle,
        explanation: currentExplanation,
        category: currentCategory,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases", id] });
      toast({
        title: "Case Updated",
        description: "Your changes have been saved.",
      });
      navigate("/archive");
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not save the case. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = refineMutation.isPending;
  const isSubmitting = updateMutation.isPending;

  const handleModeChange = (newMode: ViewMode) => {
    if (isTransitioning || mode === newMode) return;
    setIsTransitioning(true);
    setMode(newMode);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  const handleSendMessage = () => {
    if (isLoading || !caseData) return;
    
    const userInput = inputValue.trim();
    if (!userInput) return;
    
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: userInput,
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    refineMutation.mutate({
      imageBase64: caseData.imageUrl,
      currentExplanation,
      feedback: userInput,
    });
  };

  const handleSaveChanges = () => {
    updateMutation.mutate();
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

  if (isCaseLoading || !caseData) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-center px-4 h-14 border-b border-border shrink-0">
          <h1 className="text-lg font-semibold" data-testid="text-edit-title">Edit Case</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const isImageMode = mode === "image";

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Link href="/archive">
            <Button size="icon" variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold" data-testid="text-edit-title">
            Edit Case #{caseData.caseNumber}
          </h1>
        </div>
        <Button
          size="sm"
          onClick={handleSaveChanges}
          disabled={isLoading || isSubmitting}
          data-testid="button-save-case"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <Check className="w-4 h-4 mr-1" />
          )}
          Save Changes
        </Button>
      </header>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* IMAGE MODE */}
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
            <CaseImage 
              src={caseData.imageUrl} 
              alt="Case image"
              fillHeight
            />
          </div>
          
          <button
            onClick={() => handleModeChange("read")}
            disabled={isTransitioning}
            className="shrink-0 h-12 flex items-center justify-center gap-2 bg-card border-t border-border"
            data-testid="button-back-to-chat"
          >
            <ChevronUp className="w-5 h-5 text-foreground" />
            <span className="text-sm font-medium text-foreground">Back to chat</span>
          </button>
        </div>

        {/* READ MODE */}
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
                <div className="w-20 h-14 bg-muted border border-border rounded-md overflow-hidden shrink-0">
                  <img
                    src={caseData.imageUrl}
                    alt="Case thumbnail"
                    className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
                  />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium" data-testid="text-thumbnail-title">
                    {currentTitle || caseData.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tap to view image
                  </p>
                </div>
              </div>
            </button>
          )}

          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="space-y-3 py-4">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  role={message.role}
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
                placeholder="Refine the explanation..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                disabled={isLoading}
                rows={1}
                data-testid="input-chat"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim()}
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
