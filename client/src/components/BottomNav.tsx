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
      className="shrink-0 app-shell-surface border-t border-card-border grid grid-cols-3"
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
              className={`pressable relative flex flex-col items-center justify-center gap-1 w-full h-full ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`flex items-center justify-center h-9 w-12 rounded-full transition-colors ${
                  isActive ? "bg-primary/10" : "bg-transparent"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "" : ""}`} strokeWidth={isActive ? 2.25 : 1.75} />
              </span>
              <span className={`text-[11px] tracking-wide ${isActive ? "font-semibold" : "font-medium"}`}>{item.label}</span>
            </button>
          </Link>
        );
      })}
    </nav>
  );
}
