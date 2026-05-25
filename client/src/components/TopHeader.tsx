import { useEffect, useState } from "react";
import { Menu, LogIn, Users as UsersIcon, Download, Share, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { LogOut } from "lucide-react";

interface TopHeaderProps {
  onMenuClick: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function useInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosTip, setIosTip] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    const installed = () => setDeferred(null);
    window.addEventListener("appinstalled", installed);

    const ua = window.navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) setIosTip(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const prompt = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return { canPrompt: !!deferred, prompt, iosTip };
}

export function TopHeader({ onMenuClick }: TopHeaderProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { canPrompt, prompt, iosTip } = useInstallHint();
  const [iosOpen, setIosOpen] = useState(false);

  const displayName = user?.displayName ||
    (user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName || user?.email || "User");

  const initials = displayName
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className="shrink-0 h-14 app-shell-surface border-b border-card-border flex items-center justify-between px-3 gap-2"
      data-testid="header-top"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="pressable"
        data-testid="button-menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Stethoscope className="h-4 w-4" />
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight">
          UroRads
        </h1>
      </div>

      {isLoading ? (
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
      ) : isAuthenticated && user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full pressable" data-testid="button-user-menu">
              <Avatar className="w-8 h-8 ring-1 ring-card-border">
                <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-2 text-sm font-medium border-b mb-1">
              <div className="truncate">{displayName}</div>
              {user.isAdmin && (
                <div className="text-[11px] font-normal text-primary mt-0.5">Admin</div>
              )}
            </div>
            {user.isAdmin && (
              <Link href="/users">
                <DropdownMenuItem data-testid="link-users">
                  <UsersIcon className="w-4 h-4 mr-2" />
                  Users
                </DropdownMenuItem>
              </Link>
            )}
            {(canPrompt || iosTip) && (
              <>
                <DropdownMenuSeparator />
                {canPrompt ? (
                  <DropdownMenuItem onClick={prompt}>
                    <Download className="w-4 h-4 mr-2" />
                    Install app
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setIosOpen(true)}>
                    <Share className="w-4 h-4 mr-2" />
                    Add to Home Screen
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex items-center gap-1">
          {(canPrompt || iosTip) && (
            canPrompt ? (
              <Button variant="ghost" size="sm" className="pressable" onClick={prompt}>
                <Download className="w-4 h-4 mr-1.5" />
                Install
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="pressable" onClick={() => setIosOpen(true)}>
                <Share className="w-4 h-4 mr-1.5" />
                Install
              </Button>
            )
          )}
          <Link href="/login">
            <Button variant="ghost" size="sm" className="pressable" data-testid="button-login">
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </Link>
        </div>
      )}

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="w-4 h-4 text-primary" />
              Add UroRads to Home Screen
            </DialogTitle>
            <DialogDescription>
              Install UroRads on your iPhone for a fullscreen, app-like experience.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground/90 mt-2">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">1</span>
              Tap the <span className="font-semibold">Share</span> button in Safari's toolbar.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">2</span>
              Scroll and tap <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">3</span>
              Tap <span className="font-semibold">Add</span> in the top-right corner. Done.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </header>
  );
}
