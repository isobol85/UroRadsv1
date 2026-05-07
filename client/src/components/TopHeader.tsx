import { Menu, LogIn, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { LogOut } from "lucide-react";

interface TopHeaderProps {
  onMenuClick: () => void;
}

export function TopHeader({ onMenuClick }: TopHeaderProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

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
      className="shrink-0 h-14 bg-card border-b border-card-border flex items-center justify-between px-4 gap-2"
      data-testid="header-top"
    >
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={onMenuClick}
        data-testid="button-menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="text-lg font-semibold tracking-tight">UroRads</h1>

      {isLoading ? (
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
      ) : isAuthenticated && user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-sm font-medium border-b mb-1">
              {displayName}
              {user.isAdmin && (
                <span className="ml-2 text-xs text-primary">(Admin)</span>
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
            <DropdownMenuItem onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href="/login">
          <Button variant="ghost" size="sm" data-testid="button-login">
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </Button>
        </Link>
      )}
    </header>
  );
}
