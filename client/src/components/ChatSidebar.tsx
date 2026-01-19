import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface ChatSession {
  id: string;
  caseId: string;
  userId: string;
  title: string | null;
  caseName: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatSidebar({ open, onOpenChange }: ChatSidebarProps) {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: sessions = [], isLoading } = useQuery<ChatSession[]>({
    queryKey: searchQuery 
      ? ["/api/chat-sessions/search", { q: searchQuery }]
      : ["/api/chat-sessions"],
    queryFn: async () => {
      const url = searchQuery 
        ? `/api/chat-sessions/search?q=${encodeURIComponent(searchQuery)}`
        : "/api/chat-sessions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    enabled: isAuthenticated && open,
  });

  const handleSessionClick = (session: ChatSession) => {
    // Set multiple signals for reliable read-mode navigation:
    // 1. Query param - works for deep links, bookmarks, and cross-case navigation
    // 2. sessionStorage - backup for cases where query params don't trigger re-render
    // 3. Custom event - handles same-case navigation (when caseId doesn't change)
    sessionStorage.setItem('urorads_open_in_read_mode', session.caseId);
    window.dispatchEvent(new CustomEvent('urorads-open-chat', { detail: { caseId: session.caseId } }));
    setLocation(`/case/${session.caseId}?view=read`);
    onOpenChange(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-lg font-semibold">Chat History</SheetTitle>
          {isAuthenticated && (
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9"
                data-testid="input-search-chats"
              />
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          {!isAuthenticated ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-3">Sign in to see your chat history</p>
              <Link href="/login">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-sidebar-login">
                  Sign In
                </Button>
              </Link>
            </div>
          ) : isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? "No chats match your search" : "No chat history yet"}
              </p>
              <p className="text-xs mt-1">
                Start chatting on any case to see it here
              </p>
            </div>
          ) : (
            <div className="py-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSessionClick(session)}
                  className="w-full text-left p-4 hover-elevate transition-colors border-b last:border-b-0"
                  data-testid={`chat-session-${session.id}`}
                >
                  <div className="font-medium text-sm truncate">
                    {session.caseName}
                  </div>
                  {session.title && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {session.title}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDate(session.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
