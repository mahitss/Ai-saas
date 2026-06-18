"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  BookOpen,
  Brain,
  Command,
  Cpu,
  GalleryVerticalEnd,
  LibraryBig,
  Mic,
  MessageSquareText,
  MoveRight,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  Wrench,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard/chat", label: "Chat", icon: Bot },
  { href: "/dashboard/orchestrator", label: "Orchestrator", icon: Workflow },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/reports", label: "Reports", icon: BookOpen },
  { href: "/dashboard/library", label: "Library", icon: LibraryBig },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
  { href: "/dashboard/model-lab", label: "Model Lab", icon: Sparkles },
  { href: "/dashboard/developer", label: "Developer", icon: Cpu },
  { href: "/dashboard/voice", label: "Voice", icon: Mic },
  { href: "/dashboard/growth", label: "Growth", icon: Orbit },
  { href: "/dashboard/ubiquity", label: "Ubiquity", icon: MessageSquareText },
  { href: "/dashboard/comparison", label: "Compare", icon: GalleryVerticalEnd },
  { href: "/dashboard/mind-map", label: "Context", icon: Brain },
  { href: "/dashboard/style", label: "Style", icon: SlidersHorizontal },
  { href: "/dashboard/compliance", label: "Compliance", icon: Wrench },
  { href: "/dashboard/account", label: "Account", icon: Settings },
];

type DashboardShellProps = {
  displayName: string;
  children: React.ReactNode;
};

export function DashboardShell({ displayName, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  const shellWidth = useMemo(() => (collapsed ? "md:w-20" : "md:w-72"), [collapsed]);

  function openCommandBar() {
    window.dispatchEvent(new Event("open-global-command-bar"));
  }

  return (
    <div className="dashboard-surface min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-card/92 shadow-sm backdrop-blur-xl md:inset-y-0 md:left-0 md:right-auto md:flex md:flex-col md:border-b-0 md:border-r",
          shellWidth,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 md:justify-start md:px-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border border-primary/20 bg-primary text-primary-foreground shadow-sm">
              <Bot className="size-5" />
            </div>
            <div className={cn("min-w-0 transition-all", collapsed ? "md:hidden" : "md:block")}>
              <p className="text-sm font-semibold tracking-tight">Logicra</p>
              <p className="text-xs text-muted-foreground">Workspace</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden rounded-lg text-muted-foreground md:inline-flex"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>

        <nav aria-label="Dashboard" className="flex gap-2 overflow-x-auto px-3 py-3 md:flex-col md:overflow-visible">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition duration-200",
                  active
                    ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground",
                  collapsed ? "md:justify-center md:px-0" : "md:px-3",
                )}
              >
                <Icon className="size-4" />
                <span className={cn("whitespace-nowrap transition-all", collapsed ? "md:hidden" : "md:inline-flex")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-border/70 p-3 md:block">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full rounded-lg bg-card/80 shadow-sm",
              collapsed ? "justify-center px-0" : "justify-between",
            )}
            onClick={openCommandBar}
          >
            <span className={cn("flex items-center gap-2", collapsed ? "md:hidden" : "md:flex")}>
              <Command className="size-4" />
              Command Bar
            </span>
            <MoveRight className={cn("size-4", collapsed ? "hidden md:block" : "block")} />
          </Button>
          <p className={cn("mt-2 truncate text-xs text-muted-foreground", collapsed ? "md:hidden" : "md:block")}>
            Signed in as {displayName}
          </p>
        </div>
      </aside>

      <div className={cn("min-h-svh pt-24 md:pt-0 md:pl-20", collapsed ? "md:pl-20" : "md:pl-72")}>
        <div className="border-b border-border/70 bg-card/88 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">Logicra</p>
              <p className="truncate text-xs text-muted-foreground">Signed in as {displayName}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-lg bg-card"
              onClick={openCommandBar}
            >
              <Command className="mr-2 size-4" />
              Cmd K
            </Button>
          </div>
        </div>
        <main className="mx-auto w-full max-w-none p-4 md:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
