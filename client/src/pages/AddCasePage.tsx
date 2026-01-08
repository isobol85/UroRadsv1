import { useState, useRef, useEffect } from "react";
import { Plus, Send, Loader2, Check, ChevronUp, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaseImage } from "@/components/CaseImage";
import { ChatBubble } from "@/components/ChatBubble";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

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

interface VideoAnalyzeResponse {
  explanation: string;
  title: string;
  category: string;
  videoInfo: {
    duration: number;
    width: number;
    height: number;
    fps: number;
  };
  framesExtracted: number;
  thumbnail: string;
  videoUrl: string;
  mediaType: "video";
}

type ViewMode = "image" | "read";
type MediaType = "image" | "video";

export default function AddCasePage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [storedVideoUrl, setStoredVideoUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentExplanation, setCurrentExplanation] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCategory, setCurrentCategory] = useState("");
  const [hasGeneratedExplanation, setHasGeneratedExplanation] = useState(false);
  const [mode, setMode] = useState<ViewMode>("image");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

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

  const analyzeMutation = useMutation({
    mutationFn: async (data: { imageBase64: string; attendingPrompt?: string }) => {
      const response = await apiRequest("POST", "/api/ai/analyze", data);
      return response.json() as Promise<AnalyzeResponse>;
    },
    onSuccess: (data) => {
      setCurrentExplanation(data.explanation);
      setCurrentTitle(data.title);
      setCurrentCategory(data.category);
      setHasGeneratedExplanation(true);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: "ai",
        content: `Here's the AI-generated explanation for this case:\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`
      }]);
    },
    onError: () => {
      toast({
        title: "Analysis failed",
        description: "Could not analyze the image. Please try again.",
        variant: "destructive",
      });
    },
  });

  const videoAnalyzeMutation = useMutation({
    mutationFn: async (data: { video: File; attendingPrompt?: string }) => {
      const formData = new FormData();
      formData.append("video", data.video);
      if (data.attendingPrompt) {
        formData.append("attendingPrompt", data.attendingPrompt);
      }
      const response = await fetch("/api/ai/analyze-video", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Video analysis failed");
      }
      return response.json() as Promise<VideoAnalyzeResponse>;
    },
    onSuccess: (data) => {
      setCurrentExplanation(data.explanation);
      setCurrentTitle(data.title);
      setCurrentCategory(data.category);
      setSelectedImage(data.thumbnail);
      setStoredVideoUrl(data.videoUrl);
      setHasGeneratedExplanation(true);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: "ai",
        content: `Here's the AI-generated explanation from your ${data.framesExtracted}-frame CT scan video (${data.videoInfo.duration}s):\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`
      }]);
    },
    onError: () => {
      toast({
        title: "Video analysis failed",
        description: "Could not analyze the video. Please try again.",
        variant: "destructive",
      });
    },
  });

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
        content: `I've updated the explanation based on your feedback:\n\n${data.explanation}\n\nLet me know if you'd like any more changes, or click "Submit Case" when ready.`
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

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cases", {
        title: currentTitle,
        imageUrl: selectedImage,
        explanation: currentExplanation,
        category: currentCategory,
        videoUrl: storedVideoUrl,
        mediaType: mediaType,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({
        title: "Case Published",
        description: "Your teaching case is now available in the archive.",
      });
      setSelectedImage(null);
      setMessages([]);
      setCurrentExplanation("");
      setCurrentTitle("");
      setCurrentCategory("");
      setHasGeneratedExplanation(false);
      setMode("image");
      navigate("/archive");
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Could not save the case. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = analyzeMutation.isPending || refineMutation.isPending || videoAnalyzeMutation.isPending;
  const isSubmitting = submitMutation.isPending;

  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  const handleVideoClick = () => {
    videoInputRef.current?.click();
  };

  const resetState = () => {
    setSelectedImage(null);
    setSelectedVideo(null);
    // Revoke old object URL to prevent memory leak
    if (selectedVideoUrl) {
      URL.revokeObjectURL(selectedVideoUrl);
    }
    setSelectedVideoUrl(null);
    setStoredVideoUrl(null);
    setMode("image");
    setMessages([]);
    setHasGeneratedExplanation(false);
    setCurrentExplanation("");
    setCurrentTitle("");
    setCurrentCategory("");
    setInputValue("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        resetState();
        setMediaType("image");
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("video/")) {
        toast({
          title: "Invalid file type",
          description: "Please select a video file.",
          variant: "destructive",
        });
        return;
      }
      resetState();
      setMediaType("video");
      setSelectedVideo(file);
      setSelectedVideoUrl(URL.createObjectURL(file));
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleModeChange = (newMode: ViewMode) => {
    if (isTransitioning || mode === newMode) return;
    setIsTransitioning(true);
    setMode(newMode);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  const handleAnalyze = () => {
    const attendingPrompt = inputValue.trim() || undefined;
    
    // Add user message if they provided context
    if (attendingPrompt) {
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-user`,
        role: "user",
        content: attendingPrompt
      }]);
    }
    
    // Add analyzing message
    const analyzeMsg = mediaType === "video" 
      ? "Extracting frames and analyzing the CT scan video..."
      : "Analyzing the image...";
    setMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      role: "ai",
      content: analyzeMsg
    }]);
    
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    
    handleModeChange("read");
    
    if (mediaType === "video" && selectedVideo) {
      videoAnalyzeMutation.mutate({
        video: selectedVideo,
        attendingPrompt,
      });
    } else {
      analyzeMutation.mutate({
        imageBase64: selectedImage!,
        attendingPrompt,
      });
    }
  };

  const handleSendMessage = () => {
    if (isLoading) return;
    
    const userInput = inputValue.trim();
    if (!userInput) return;

    // If we haven't generated explanation yet, this is context for initial analysis
    if (!hasGeneratedExplanation) {
      handleAnalyze();
      return;
    }
    
    // Otherwise, refine the existing explanation
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
      imageBase64: selectedImage!,
      currentExplanation,
      feedback: userInput,
    });
  };

  const handleSubmitCase = () => {
    submitMutation.mutate();
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

  // No media selected - show upload prompt with image and video options
  const hasMedia = selectedImage || selectedVideoUrl;
  if (!hasMedia) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-center px-4 h-14 border-b border-border shrink-0">
          <h1 className="text-lg font-semibold" data-testid="text-add-title">Add Case</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="flex gap-6">
            <div className="flex flex-col items-center">
              <Button
                size="icon"
                className="w-16 h-16 rounded-full"
                onClick={handlePlusClick}
                data-testid="button-add-image"
              >
                <Image className="w-8 h-8" />
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Add Image
              </p>
            </div>
            <div className="flex flex-col items-center">
              <Button
                size="icon"
                variant="secondary"
                className="w-16 h-16 rounded-full"
                onClick={handleVideoClick}
                data-testid="button-add-video"
              >
                <Video className="w-8 h-8" />
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Add CT Video
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Upload a single image or a short video (10-15 sec) of scrolling through CT slices
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoSelect}
          data-testid="input-video"
        />
      </div>
    );
  }

  const isImageMode = mode === "image";

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold" data-testid="text-add-title">Add Case</h1>
        {hasGeneratedExplanation && (
          <Button
            size="sm"
            onClick={handleSubmitCase}
            disabled={isLoading || isSubmitting}
            data-testid="button-submit-case"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            Submit Case
          </Button>
        )}
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
            {mediaType === "video" && selectedVideoUrl ? (
              <div className="flex-1 flex items-center justify-center rounded-md overflow-hidden bg-black/5 dark:bg-white/5">
                <video
                  src={selectedVideoUrl}
                  controls
                  className="max-w-full max-h-full object-contain"
                  data-testid="video-preview"
                />
              </div>
            ) : selectedImage ? (
              <CaseImage 
                src={selectedImage} 
                alt="Selected case image"
                fillHeight
              />
            ) : null}
          </div>
          
          {hasGeneratedExplanation ? (
            <button
              onClick={() => handleModeChange("read")}
              disabled={isTransitioning}
              className="shrink-0 h-12 flex items-center justify-center gap-2 bg-card border-t border-border"
              data-testid="button-back-to-chat"
            >
              <ChevronUp className="w-5 h-5 text-foreground" />
              <span className="text-sm font-medium text-foreground">Back to chat</span>
            </button>
          ) : (
            <div className="shrink-0 p-3 border-t border-border bg-background">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={mediaType === "video" ? "Add context about this CT video (optional)..." : "Add context about this image (optional)..."}
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                  disabled={isLoading}
                  rows={1}
                  data-testid="input-context"
                />
                <Button
                  size="icon"
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  data-testid="button-analyze"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {mediaType === "video" ? "Tap arrow to extract frames and analyze with AI" : "Tap arrow to analyze with AI"}
              </p>
            </div>
          )}
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
                <div className="w-20 h-14 bg-muted border border-border rounded-md overflow-hidden shrink-0 relative">
                  {mediaType === "video" && selectedVideoUrl ? (
                    <>
                      <video
                        src={selectedVideoUrl}
                        className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
                        muted
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Video className="w-5 h-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <img
                      src={selectedImage || ""}
                      alt="Case thumbnail"
                      className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
                    />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium" data-testid="text-thumbnail-title">
                    {currentTitle || (mediaType === "video" ? "New CT video case" : "New case image")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mediaType === "video" ? "Tap to view video" : "Tap to view image"}
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
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Refine the explanation..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                disabled={isLoading || !hasGeneratedExplanation}
                rows={1}
                data-testid="input-chat"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim() || !hasGeneratedExplanation}
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoSelect}
        data-testid="input-video-main"
      />
    </div>
  );
}
