import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Boxes, LayoutGrid, LogOut, Menu, Plus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useProjects } from "../../lib/queries";
import { Button } from "../ui/Button";
import { StatusBadge } from "../StatusBadge";
import { cn } from "../../lib/utils";

function BrandMark() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-[#072b33] text-accent">
      <Boxes aria-hidden="true" className="h-5 w-5" />
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const { data: projects } = useProjects();
  const navigate = useNavigate();

  const recent = (projects ?? []).slice(0, 7);
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) || user?.email?.split("@")[0] || "Archaeologist";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold tracking-wide text-fg">Software Archaeologist</p>
          <p className="truncate text-[11px] text-faint">Recovery Workspace</p>
        </div>
      </div>

      <div className="px-3 py-3">
        <Button
          className="w-full"
          onClick={() => {
            navigate("/projects/new");
            onNavigate?.();
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New Recovery Mission
        </Button>
      </div>

      <nav className="px-2" aria-label="Primary">
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
            )
          }
        >
          <LayoutGrid aria-hidden="true" className="h-4 w-4" />
          Dashboard
        </NavLink>
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
        <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-widest text-faint">Recent missions</p>
        {recent.length === 0 ? (
          <p className="px-3 py-2 text-xs text-faint">No missions yet — start your first recovery.</p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((p) => (
              <li key={p.id}>
                <NavLink
                  to={`/projects/${p.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                      isActive ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
                    )
                  }
                >
                  <span className="truncate">{p.name}</span>
                  <StatusBadge status={p.status} />
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto border-t border-line px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{displayName}</p>
            <p className="truncate text-[11px] text-faint">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut()}>
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-base lg:grid lg:grid-cols-[264px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-panel/70 backdrop-blur lg:block">
        <SidebarContent />
      </aside>

      {/* mobile off-canvas */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#02060f]/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-panel">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-3rem)]">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-base/85 px-4 py-3 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BrandMark />
            <span className="font-heading text-sm font-semibold text-fg">Software Archaeologist</span>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
