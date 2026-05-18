import { Link, useLocation } from "wouter";
import { Layers, Heart, BarChart3, User, LogOut } from "lucide-react";
import { SwipeHireLogo } from "./SwipeHireLogo";
import { ThemeToggle } from "./ThemeProvider";
import { apiFetch } from "@/lib/api";

interface TopNavigationProps {
  user?: { firstName?: string; email?: string };
}

const NAV_ITEMS = [
  { path: "/", label: "Discover", icon: Layers },
  { path: "/liked", label: "Liked", icon: Heart },
  { path: "/dashboard", label: "Applications", icon: BarChart3 },
  { path: "/profile", label: "Profile", icon: User },
];

export function TopNavigation({ user }: TopNavigationProps) {
  const [location] = useLocation();

  const logout = async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/login";
  };

  return (
    <nav className="hidden md:block bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
        <Link href="/" className="flex-shrink-0">
          <SwipeHireLogo size="md" />
        </Link>
        <div className="flex items-center gap-1 flex-1 justify-center">
          {NAV_ITEMS.map(item => {
            const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <span
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {user && (
            <span className="text-sm text-muted-foreground hidden lg:inline mr-1">
              {user.firstName ?? user.email}
            </span>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
