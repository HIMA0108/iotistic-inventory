import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Package, Cpu, ScanLine, History, LogOut, Wifi, WifiOff, Users, Calculator, ShieldAlert, BarChart3, FileText, CalendarDays, Sparkles, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/useInventoryCache";
import { cn } from "@/lib/utils";
import logo from "@/assets/iotistic-logo.png";

export default function AppShell() {
  const { user, role, isAdmin, isManager, displayTitle, fullName, signOut } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const allNavItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, show: true, mobile: true },
    { to: "/scan", label: "Scan", icon: ScanLine, show: true, mobile: true },
    { to: "/components", label: "Components", icon: Package, show: true, mobile: true },
    { to: "/devices", label: "Devices", icon: Cpu, show: true, mobile: true },
    { to: "/reports", label: "My report", icon: FileText, show: true, mobile: true },
    { to: "/leaves", label: "Leaves", icon: CalendarDays, show: true, mobile: false },
    { to: "/defective", label: "Defective", icon: ShieldAlert, show: true, mobile: false },
    { to: "/planner", label: "Planner", icon: Calculator, show: isAdmin, mobile: false },
    { to: "/logs", label: "Activity", icon: History, show: true, mobile: true },
    { to: "/history", label: "Inv. report", icon: BarChart3, show: isAdmin, mobile: false },
    { to: "/work-tracking", label: "Work tracking", icon: LineChart, show: isManager, mobile: false },
    { to: "/ai-reports", label: "AI reports", icon: Sparkles, show: isManager, mobile: false },
    { to: "/users", label: "Users", icon: Users, show: isAdmin, mobile: false },
  ];
  const navItems = allNavItems.filter((i) => i.show);
  const mobileNavItems = navItems.filter((i) => i.mobile);

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface-elevated/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Iotistic" className="h-10 w-10 rounded-xl object-cover shadow-elevation-2" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Iotistic Production</div>
              <div className="text-[11px] text-muted-foreground">Inventory</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div
              className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:flex",
                online
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/15 text-warning-foreground"
              )}
            >
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? "Online" : "Offline"}
            </div>
            {(displayTitle || role) && (
              <span className="hidden rounded-full bg-primary-container px-2.5 py-1 text-xs font-semibold tracking-wide text-primary-container-foreground sm:inline">
                {displayTitle ?? (role ? role.toUpperCase() : "")}
              </span>
            )}
            <span className="hidden text-xs text-muted-foreground md:inline">{fullName ?? user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface-elevated/95 backdrop-blur sm:hidden">
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
        >
          {mobileNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Side nav (desktop) */}
      <nav className="fixed left-4 top-24 hidden w-56 sm:block">
        <ul className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-elevated p-2 shadow-elevation-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-container text-primary-container-foreground"
                      : "text-foreground hover:bg-secondary"
                  )
                }
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
