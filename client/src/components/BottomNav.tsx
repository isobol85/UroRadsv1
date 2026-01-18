import { useLocation, Link } from "wouter";
import { ImageIcon, Archive, Plus } from "lucide-react";

const navItems = [
  { path: "/", label: "Case", icon: ImageIcon },
  { path: "/archive", label: "Archive", icon: Archive },
  { path: "/add", label: "Add", icon: Plus },
];

export function BottomNav() {
  const [location] = useLocation();
  const isCasePage = location === "/" || location.startsWith("/case/");

  return (
    <nav 
      className="shrink-0 bg-card border-t border-card-border grid grid-cols-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 34px)', minHeight: '4rem' }}
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
    </nav>
  );
}
