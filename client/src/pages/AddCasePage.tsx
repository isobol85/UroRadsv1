import { useState, useRef, useEffect } from "react";
import { Upload, Send, Loader2, Check, ChevronUp, Video, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaseImage } from "@/components/CaseImage";
import { ChatBubble } from "@/components/ChatBubble";
import { LoadingPearls } from "@/components/LoadingPearls";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import type { Case } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWakeLock } from "@/hooks/use-wake-lock";

// Persisted between renders / reloads so a mobile user whose screen slept can
// reconnect to the in-flight analysis instead of seeing a broken state. We
// intentionally use sessionStorage (per-tab, cleared on close) rather than
// localStorage since this is transient upload state.
const PENDING_JOB_KEY = "urorads_pending_job";

type PendingJob = {
  jobId: string;
  kind: "image" | "video";
  mediaType: MediaType;
  fileName?: string;
  attendingPrompt?: string;
  // Image only: a data URL we hold onto so a reload can still submit the case.
  // We skip persisting it if it doesn't fit in sessionStorage.
  imageData?: string | null;
  lastSeq?: number;
};

function readPendingJob(): PendingJob | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOB_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingJob;
  } catch {
    return null;
  }
}

function writePendingJob(job: PendingJob) {
  try {
    sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job));
  } catch {
    // Quota exceeded (usually because of a large imageData blob). Retry once
    // without the image so at least the jobId survives.
    if (job.imageData) {
      try {
        sessionStorage.setItem(
          PENDING_JOB_KEY,
          JSON.stringify({ ...job, imageData: null }),
        );
      } catch {
        // give up — wake lock should keep most flows alive anyway
      }
    }
  }
}

function clearPendingJob() {
  try {
    sessionStorage.removeItem(PENDING_JOB_KEY);
  } catch {
    // ignore
  }
}

async function pollJobUntilDone(
  jobId: string,
  signal?: AbortSignal,
): Promise<{ status: string; result: any; error: any }> {
  // Conservative backoff: 1s, 2s, 4s, then cap at 5s.
  const delays = [1000, 2000, 4000];
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(`/api/ai/jobs/${jobId}`, { credentials: "include", signal });
    if (res.status === 404) {
      throw new Error("This analysis is no longer available. Please try again.");
    }
    if (!res.ok) {
      throw new Error("Could not reach the analysis service.");
    }
    const snap = await res.json();
    if (snap.status === "completed" || snap.status === "failed") {
      return { status: snap.status, result: snap.result, error: snap.error };
    }
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 5000;
    attempt += 1;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

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

interface StreamingState {
  isStreaming: boolean;
  streamedText: string;
  statusMessage: string;
  displayMessage: string;
}

type ViewMode = "image" | "read";
type MediaType = "image" | "video";

export default function AddCasePage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [storedVideoUrl, setStoredVideoUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
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
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    streamedText: "",
    statusMessage: "",
    displayMessage: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let jobId: string | undefined;
      try {
        const response = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
          signal: controller.signal,
        });

        jobId = response.headers.get("X-Job-Id") ?? undefined;
        if (jobId) {
          writePendingJob({
            jobId,
            kind: "image",
            mediaType: "image",
            fileName: selectedFileName ?? undefined,
            attendingPrompt: data.attendingPrompt,
            imageData: data.imageBase64,
          });
        }

        if (response.ok) {
          return (await response.json()) as AnalyzeResponse;
        }

        // Non-OK but server may still be processing the job in the background.
        if (jobId) {
          const snap = await pollJobUntilDone(jobId);
          if (snap.status === "completed") return snap.result as AnalyzeResponse;
          throw new Error(snap.error?.details || snap.error?.error || "Analysis failed");
        }
        throw new Error("Analysis failed");
      } catch (err) {
        if ((err as any)?.name === "AbortError") throw err;
        // Connection died mid-request (typical mobile screen-sleep case): the
        // job is still running server-side, so fall back to polling its result.
        if (jobId) {
          const snap = await pollJobUntilDone(jobId);
          if (snap.status === "completed") return snap.result as AnalyzeResponse;
          throw new Error(snap.error?.details || snap.error?.error || "Analysis failed");
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      clearPendingJob();
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
      clearPendingJob();
      toast({
        title: "Analysis failed",
        description: "Could not analyze the image. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Consume an SSE response body, calling onEvent for each parsed event.
  // Returns normally when the stream ends; throws on network errors.
  const consumeSseResponse = async (
    response: Response,
    onEvent: (eventType: string, data: any) => void,
    signal: AbortSignal,
  ) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";

    const dispatchBlock = (block: string) => {
      const lines = block.split("\n");
      let eventType = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (dataLines.length === 0) return;
      const dataStr = dataLines.join("\n").trim();
      if (!dataStr) return;
      try {
        onEvent(eventType, JSON.parse(dataStr));
      } catch (e) {
        if (e instanceof SyntaxError) return;
        throw e;
      }
    };

    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        if (block.trim()) dispatchBlock(block);
      }
    }
    if (buffer.trim()) dispatchBlock(buffer);
  };

  // Drive video streaming state from SSE events. Returns true if a terminal
  // event (complete/error) was seen, so callers know not to retry.
  const handleVideoStreamEvents = (
    onTerminal: () => void,
    seqRef: { current: number },
    accumulatedTextRef: { current: string },
  ) => {
    return (eventType: string, data: any) => {
      // If the server is replaying events we already applied (warm reconnect
      // after a stream drop), skip them so chunk text isn't appended twice.
      const seq = typeof data?.seq === "number" ? data.seq : undefined;
      if (seq !== undefined && seq <= seqRef.current) return;
      if (seq !== undefined) seqRef.current = seq;

      if (eventType === "status" && data.status) {
        setStreamingState(prev => ({
          ...prev,
          statusMessage: data.status,
          displayMessage: data.message || data.status,
        }));
      }

      if (eventType === "chunk" && data.text) {
        accumulatedTextRef.current += data.text;
        const text = accumulatedTextRef.current;
        setStreamingState(prev => ({ ...prev, streamedText: text }));
      }

      if (eventType === "complete" && data.explanation !== undefined) {
        setStreamingState(prev => ({
          ...prev,
          statusMessage: "complete",
          displayMessage: "Analysis complete",
        }));

        setCurrentExplanation(data.explanation);
        setCurrentTitle(data.title);
        setCurrentCategory(data.category);
        setSelectedImage(data.thumbnail);
        setStoredVideoUrl(data.videoUrl);
        setHasGeneratedExplanation(true);

        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== "streaming-msg");
          return [...filtered, {
            id: `msg-${Date.now()}`,
            role: "ai",
            content: `Here's the AI-generated explanation from your CT scan video (${data.videoInfo?.duration || 0}s):\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`,
          }];
        });

        clearPendingJob();
        setTimeout(() => {
          setStreamingState({
            isStreaming: false,
            streamedText: "",
            statusMessage: "",
            displayMessage: "",
          });
        }, 800);
        onTerminal();
      }

      if (eventType === "error" && data.error) {
        onTerminal();
        throw new Error(data.details || data.error);
      }
    };
  };

  const startStreamingAnalysis = async (video: File, attendingPrompt?: string) => {
    const formData = new FormData();
    formData.append("video", video);
    if (attendingPrompt) {
      formData.append("attendingPrompt", attendingPrompt);
    }

    abortControllerRef.current = new AbortController();
    const controller = abortControllerRef.current;

    setStreamingState({
      isStreaming: true,
      streamedText: "",
      statusMessage: "processing",
      displayMessage: "Uploading video...",
    });

    const seqRef = { current: 0 };
    const accumulatedTextRef = { current: "" };
    let terminal = false;
    const markTerminal = () => { terminal = true; };
    const onEvent = handleVideoStreamEvents(markTerminal, seqRef, accumulatedTextRef);

    let jobId: string | undefined;

    const persistContext = () => {
      if (!jobId) return;
      writePendingJob({
        jobId,
        kind: "video",
        mediaType: "video",
        fileName: video.name,
        attendingPrompt,
        lastSeq: seqRef.current,
      });
    };

    try {
      const response = await fetch("/api/ai/analyze-video-stream", {
        method: "POST",
        body: formData,
        credentials: "include",
        signal: controller.signal,
      });

      jobId = response.headers.get("X-Job-Id") ?? undefined;
      persistContext();

      if (!response.ok) {
        throw new Error("Video analysis failed");
      }

      await consumeSseResponse(response, (ev, data) => {
        if (ev === "job" && data?.jobId && !jobId) {
          jobId = data.jobId;
          persistContext();
        }
        onEvent(ev, data);
        // Persist progress only on status changes (a handful of writes per
        // analysis) instead of on every chunk to avoid synchronous
        // sessionStorage churn during long streams. Cold-resume after a full
        // reload re-replays from seq=0 anyway, and warm reconnect uses the
        // in-memory seqRef.
        if (ev === "status") persistContext();
      }, controller.signal);

      // Stream ended without a terminal event — try one resume in case the
      // connection was dropped (e.g. mobile screen sleep) before the server
      // emitted "complete".
      if (!terminal && jobId && !controller.signal.aborted) {
        await resumeVideoStream(jobId, seqRef, accumulatedTextRef, onEvent, controller.signal);
      }

      if (terminal) return;

      // Genuinely no terminal event after all retries — bail out cleanly.
      setStreamingState({ isStreaming: false, streamedText: "", statusMessage: "", displayMessage: "" });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;

      // Connection error mid-stream: try to resume from the job server-side.
      if (jobId && !controller.signal.aborted) {
        try {
          await resumeVideoStream(jobId, seqRef, accumulatedTextRef, onEvent, controller.signal);
          if (terminal) return;
        } catch (resumeErr) {
          if ((resumeErr as Error).name === "AbortError") return;
          // fall through to error UI
          error = resumeErr;
        }
      }

      clearPendingJob();
      setStreamingState({ isStreaming: false, streamedText: "", statusMessage: "", displayMessage: "" });
      toast({
        title: "Video analysis failed",
        description: error instanceof Error ? error.message : "Could not analyze the video. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Reconnects to an in-flight video job and continues streaming from where
  // we left off. Retries with backoff on transient failures.
  const resumeVideoStream = async (
    jobId: string,
    seqRef: { current: number },
    accumulatedTextRef: { current: string },
    onEvent: (ev: string, data: any) => void,
    signal: AbortSignal,
  ) => {
    const delays = [500, 1500, 3000, 5000];
    setIsReconnecting(true);
    setReconnectAttempt(1);
    try {
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (signal.aborted) return;
        setReconnectAttempt(attempt + 1);
        try {
          const url = `/api/ai/jobs/${jobId}/stream?sinceSeq=${seqRef.current}`;
          const res = await fetch(url, { credentials: "include", signal });
          if (res.status === 404) {
            throw new Error("This analysis is no longer available. Please try again.");
          }
          if (!res.ok) throw new Error("Could not reconnect to analysis");
          // Stream re-opened: drop the "Reconnecting…" indicator while we
          // consume events. If the stream drops again mid-consumption the
          // outer loop will flip it back on.
          setIsReconnecting(false);
          await consumeSseResponse(res, (ev, data) => {
            if (ev === "job") return;
            onEvent(ev, data);
            if (ev === "status") {
              writePendingJob({
                jobId,
                kind: "video",
                mediaType: "video",
                lastSeq: seqRef.current,
              });
            }
          }, signal);
          return; // stream ended cleanly (terminal event handled inside onEvent)
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          if (attempt === delays.length - 1) throw err;
          setIsReconnecting(true);
          await new Promise(r => setTimeout(r, delays[attempt]));
        }
      }
    } finally {
      setIsReconnecting(false);
      setReconnectAttempt(0);
    }
  };

  const videoAnalyzeMutation = useMutation({
    mutationFn: async (data: { video: File; attendingPrompt?: string }) => {
      await startStreamingAnalysis(data.video, data.attendingPrompt);
      return null;
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
      return response.json() as Promise<Case>;
    },
    onSuccess: (newCase: Case) => {
      queryClient.setQueryData<Case[]>(["/api/cases"], (oldCases) => {
        return oldCases ? [newCase, ...oldCases] : [newCase];
      });
      clearPendingJob();
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

  const [isResumingImage, setIsResumingImage] = useState(false);
  // True while resumeVideoStream is actively retrying. Used to surface a
  // "Reconnecting…" indicator so a flaky mobile connection doesn't look like
  // a frozen "Analyzing…" screen.
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const isLoading = analyzeMutation.isPending || refineMutation.isPending || videoAnalyzeMutation.isPending || streamingState.isStreaming || isResumingImage;
  const isSubmitting = submitMutation.isPending;

  // Hold the screen Wake Lock for as long as an analysis is in flight, so
  // mobile devices don't turn the display off and tear down our SSE stream.
  useWakeLock(isLoading);

  // On mount, check whether a previous analysis is still running server-side
  // (e.g. the user's phone slept and the original fetch died). If so, resume
  // listening so the result hydrates back into the UI.
  useEffect(() => {
    const pending = readPendingJob();
    if (!pending) return;

    let cancelled = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    (async () => {
      try {
        // Fetch a snapshot first so we know whether work has already finished.
        const res = await fetch(`/api/ai/jobs/${pending.jobId}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (cancelled || controller.signal.aborted) return;
        if (res.status === 404) {
          clearPendingJob();
          return;
        }
        if (!res.ok) return;
        const snap = await res.json();

        // Restore the chat shell so the user sees the same "Analyzing…" state
        // they were on before the screen slept.
        setMediaType(pending.mediaType);
        if (pending.fileName) setSelectedFileName(pending.fileName);
        if (pending.kind === "image" && pending.imageData) {
          setSelectedImage(pending.imageData);
        }
        setMode("read");
        setMessages([{
          id: `msg-resume-${Date.now()}`,
          role: "ai",
          content: pending.mediaType === "video"
            ? "Resuming your CT scan video analysis..."
            : "Resuming your image analysis...",
        }]);

        if (snap.status === "completed" && snap.result) {
          const data = snap.result;
          setCurrentExplanation(data.explanation);
          setCurrentTitle(data.title);
          setCurrentCategory(data.category);
          if (pending.kind === "video") {
            setSelectedImage(data.thumbnail);
            setStoredVideoUrl(data.videoUrl);
          }
          setHasGeneratedExplanation(true);
          setMessages([{
            id: `msg-${Date.now()}`,
            role: "ai",
            content: pending.kind === "video"
              ? `Here's the AI-generated explanation from your CT scan video (${data.videoInfo?.duration || 0}s):\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`
              : `Here's the AI-generated explanation for this case:\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`,
          }]);
          clearPendingJob();
          return;
        }

        if (snap.status === "failed") {
          clearPendingJob();
          toast({
            title: pending.kind === "video" ? "Video analysis failed" : "Analysis failed",
            description: snap.error?.details || snap.error?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Still running — re-attach to the live job.
        if (pending.kind === "video") {
          setStreamingState({
            isStreaming: true,
            streamedText: "",
            statusMessage: "analyzing",
            displayMessage: "Reconnecting to analysis...",
          });
          const seqRef = { current: pending.lastSeq ?? 0 };
          const accumulatedTextRef = { current: "" };
          let terminal = false;
          const onEvent = handleVideoStreamEvents(
            () => { terminal = true; },
            seqRef,
            accumulatedTextRef,
          );
          try {
            await resumeVideoStream(pending.jobId, seqRef, accumulatedTextRef, onEvent, controller.signal);
            if (!terminal && !controller.signal.aborted) {
              setStreamingState({ isStreaming: false, streamedText: "", statusMessage: "", displayMessage: "" });
              clearPendingJob();
            }
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            clearPendingJob();
            setStreamingState({ isStreaming: false, streamedText: "", statusMessage: "", displayMessage: "" });
            toast({
              title: "Video analysis failed",
              description: err instanceof Error ? err.message : "Could not reconnect to the analysis.",
              variant: "destructive",
            });
          }
        } else {
          // Image: poll the job until terminal, then hydrate as if the
          // original POST had returned normally.
          setIsResumingImage(true);
          try {
            const result = await pollJobUntilDone(pending.jobId, controller.signal);
            if (cancelled || controller.signal.aborted) return;
            if (result.status === "completed" && result.result) {
              const data = result.result;
              setCurrentExplanation(data.explanation);
              setCurrentTitle(data.title);
              setCurrentCategory(data.category);
              setHasGeneratedExplanation(true);
              setMessages([{
                id: `msg-${Date.now()}`,
                role: "ai",
                content: `Here's the AI-generated explanation for this case:\n\n${data.explanation}\n\nWould you like me to refine any part of this explanation?`,
              }]);
              clearPendingJob();
            } else {
              clearPendingJob();
              toast({
                title: "Analysis failed",
                description: result.error?.details || result.error?.error || "Please try again.",
                variant: "destructive",
              });
            }
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            clearPendingJob();
            toast({
              title: "Analysis failed",
              description: err instanceof Error ? err.message : "Could not reconnect to the analysis.",
              variant: "destructive",
            });
          } finally {
            setIsResumingImage(false);
          }
        }
      } catch {
        // network down — leave pending in storage; user can retry on next visit
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Intentionally only runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show login prompt if not authenticated (must be after all hooks)
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-center px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
          <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-add-title">Add Case</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" aria-hidden="true" />
            <div className="relative w-20 h-20 rounded-full bg-card border border-card-border shadow-sm flex items-center justify-center">
              <LogIn className="w-8 h-8 text-primary/70" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Sign in to add cases</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              You need to be logged in to contribute teaching cases to the library.
            </p>
          </div>
          <Link href="/login">
            <Button size="lg" className="gap-2 rounded-full px-6 shadow-sm" data-testid="button-login-prompt">
              <LogIn className="w-5 h-5" />
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const resetState = () => {
    clearPendingJob();
    setSelectedImage(null);
    setSelectedVideo(null);
    setSelectedFileName(null);
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
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          resetState();
          setMediaType("image");
          setSelectedImage(reader.result as string);
          setSelectedFileName(file.name);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("video/")) {
        resetState();
        setMediaType("video");
        setSelectedVideo(file);
        setSelectedVideoUrl(URL.createObjectURL(file));
        setSelectedFileName(file.name);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please select an image or video file.",
          variant: "destructive",
        });
        return;
      }
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
      feedback: mediaType === "video"
        ? `${userInput}\n\n(Note: source media is a CT video; the attached image is a representative thumbnail frame.)`
        : userInput,
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
        <header className="flex items-center justify-center px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
          <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-add-title">Add Case</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" aria-hidden="true" />
            <div className="relative w-20 h-20 rounded-full bg-card border border-card-border shadow-sm flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary/70" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-semibold tracking-tight">Upload a teaching case</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Upload a single image or a short video (10-15 sec) of scrolling through CT slices.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full max-w-xs h-12 text-base gap-2 rounded-full shadow-sm"
            onClick={handleUploadClick}
            data-testid="button-upload"
          >
            <Upload className="w-5 h-5" />
            Choose file
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file"
        />
      </div>
    );
  }

  const isImageMode = mode === "image";

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-14 app-shell-surface border-b border-card-border shrink-0">
        <h1 className="text-[15px] font-semibold tracking-tight" data-testid="text-add-title">Add Case</h1>
        {hasGeneratedExplanation && (
          <Button
            size="sm"
            onClick={handleSubmitCase}
            disabled={isLoading || isSubmitting}
            className="rounded-full shadow-sm"
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
              <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-card-border shadow-sm">
                <video
                  src={selectedVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
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
                        playsInline
                        preload="metadata"
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

              {streamingState.isStreaming && streamingState.streamedText && (
                <div className="flex justify-start" data-testid="chat-streaming">
                  <div className="bg-muted rounded-2xl rounded-tl-sm p-4 max-w-[85%]">
                    <p className="text-sm whitespace-pre-wrap">{streamingState.streamedText}</p>
                    <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5" />
                    {isReconnecting && (
                      <div
                        className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
                        data-testid="status-reconnecting"
                      >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>
                          Reconnecting to analysis
                          {reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ""}…
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Removed inline LoadingPearls - now shown as full-screen overlay */}

              {isLoading && !streamingState.isStreaming && !streamingState.streamedText && (
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
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file"
      />

      {/* Full-screen cinematic loading overlay for image/video analysis */}
      {(analyzeMutation.isPending || isResumingImage || (streamingState.isStreaming && !streamingState.streamedText)) && (
        <div className="fixed inset-0 z-50" data-testid="loading-overlay">
          <LoadingPearls 
            statusMessage={(analyzeMutation.isPending || isResumingImage || isReconnecting) ? "analyzing" : streamingState.statusMessage} 
            displayMessage={
              isReconnecting
                ? `Reconnecting to analysis${reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ""}…`
                : analyzeMutation.isPending
                  ? "Analyzing Image"
                  : isResumingImage
                    ? "Reconnecting to Analysis"
                    : (streamingState.displayMessage || "Analyzing DICOM Data")
            }
            imageThumbnail={(analyzeMutation.isPending || isResumingImage) && mediaType === "image" ? (selectedImage || undefined) : undefined}
            fileName={(analyzeMutation.isPending || isResumingImage) && mediaType === "image" ? (selectedFileName || undefined) : undefined}
          />
        </div>
      )}
    </div>
  );
}
