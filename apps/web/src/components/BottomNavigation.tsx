import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Layers, Heart, BarChart3, User } from "lucide-react";

interface BottomNavigationProps {
  currentPath: string;
}

export function BottomNavigation({ currentPath }: BottomNavigationProps) {
  const navItems = [
    {
      path: "/",
      icon: Layers,
      label: "Jobs",
    },
    {
      path: "/liked",
      icon: Heart,
      label: "Liked",
    },
    {
      path: "/dashboard",
      icon: BarChart3,
      label: "Dashboard",
    },
    {
      path: "/profile",
      icon: User,
      label: "Profile",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path;
          
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={`flex flex-col items-center space-y-1 p-2 h-auto ${
                  isActive
                    ? 'brand-teal bg-primary/10'
                    : 'text-brand-gray hover:brand-teal'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
