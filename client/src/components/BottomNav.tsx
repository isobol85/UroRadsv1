import { useLocation, Link } from "wouter";
import { ImageIcon, Archive, Plus, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { path: "/", label: "Case", icon: ImageIcon },
  { path: "/archive", label: "Archive", icon: Archive },
  { path: "/add", label: "Add", icon: Plus },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const isCasePage = location === "/" || location.startsWith("/case/");

  const displayName = user?.displayName || 
    (user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user?.firstName || "User");
  
  const initials = displayName
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <nav 
      className="shrink-0 bg-card border-t border-card-border grid grid-cols-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', minHeight: '4rem' }}
      data-testid="nav-bottom"
    >
      {navItems.map((item) => {
        const isActive = item.path === "/" 
          ? isCasePage 
          : location === item.path;
        const Icon = item.icon;
        
        return (
          <Link key={item.path} href={item.path}>
            <button
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium tracking-wide">{item.label}</span>
            </button>
          </Link>
        );
      })}
      
      {isAuthenticated ? (
        <button
          onClick={() => logout()}
          className="flex flex-col items-center justify-center gap-1 w-full h-full transition-colors text-muted-foreground"
          data-testid="nav-user"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium tracking-wide">Logout</span>
        </button>
      ) : (
        <Link href="/login">
          <button
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${
              location === "/login" ? "text-primary" : "text-muted-foreground"
            }`}
            data-testid="nav-login"
          >
            <User className="h-6 w-6" />
            <span className="text-xs font-medium tracking-wide">Sign In</span>
          </button>
        </Link>
      )}
    </nav>
  );
}
