"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Menu,
  Play,
  Search,
  Star,
  User,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4";

function animationDelay(delay: number) {
  return { animationDelay: `${delay}ms` };
}

function LiquidButton({
  children,
  className,
  href,
  label,
  onClick,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
  label?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const sharedClassName = cn(
    "liquid-glass inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]",
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={sharedClassName} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} className={sharedClassName} style={style}>
      {children}
    </button>
  );
}

export function AiAgentLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = useMemo(
    () => [
      { label: "Chat", href: "/dashboard/chat" },
      { label: "Agents", href: "/dashboard/orchestrator" },
      { label: "Model Lab", href: "/dashboard/model-lab" },
      { label: "Library", href: "/dashboard/library" },
      { label: "Trust", href: "/dashboard/security" },
    ],
    [],
  );

  return (
    <main className="relative flex h-screen min-h-[640px] overflow-hidden bg-black text-white">
      <video
        className="fixed inset-0 z-0 h-full w-full object-cover"
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />

      <div className="pointer-events-none fixed inset-0 z-[1] backdrop-blur-xl [mask-image:linear-gradient(to_top,black_0%,transparent_45%)] [-webkit-mask-image:linear-gradient(to_top,black_0%,transparent_45%)]" />

      <div className="relative z-10 flex h-full w-full flex-col">
        <header className="relative z-50 flex items-center justify-between px-4 py-4 sm:px-6 md:px-12 md:py-6">
          <Link
            href="/"
            className="animate-blur-fade-up flex h-8 items-center text-lg font-semibold tracking-[0.24em] text-white md:h-10 md:text-xl"
            style={animationDelay(0)}
          >
            LOGICRA
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((item, index) => (
              <Link
                key={item.label}
                href={item.href}
                className="animate-blur-fade-up text-sm text-white transition-colors hover:text-gray-300"
                style={animationDelay(100 + index * 50)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LiquidButton
              href="/dashboard/chat"
              className="animate-blur-fade-up hidden px-4 py-2 sm:inline-flex md:px-6"
              style={animationDelay(350)}
            >
              Search
              <Search size={18} />
            </LiquidButton>
            <LiquidButton
              href="/dashboard/account"
              label="Open profile"
              className="animate-blur-fade-up hidden h-10 w-10 sm:inline-flex"
              style={animationDelay(400)}
            >
              <User size={18} />
            </LiquidButton>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="liquid-glass animate-blur-fade-up relative grid h-10 w-10 place-items-center rounded-full text-white lg:hidden"
              style={animationDelay(350)}
            >
              <Menu
                size={20}
                className={cn(
                  "absolute transition-all duration-500 ease-out",
                  menuOpen ? "rotate-180 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
                )}
              />
              <X
                size={20}
                className={cn(
                  "absolute transition-all duration-500 ease-out",
                  menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-50 opacity-0",
                )}
              />
            </button>
          </div>

          <div
            className={cn(
              "absolute left-0 right-0 top-[72px] z-40 bg-gray-900/95 px-4 py-4 shadow-2xl backdrop-blur-lg transition-all duration-500 ease-out sm:px-6 lg:hidden",
              "border-y border-gray-800",
              menuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0",
            )}
          >
            <nav className="flex flex-col">
              {navItems.map((item, index) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-3 text-sm text-white transition-all duration-500 ease-out hover:bg-gray-800/50",
                    menuOpen ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0",
                  )}
                  style={{ transitionDelay: menuOpen ? `${index * 50}ms` : "0ms" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-800 pt-4 sm:hidden">
                <LiquidButton href="/dashboard/chat" className="px-4 py-2.5">
                  Search
                  <Search size={18} />
              </LiquidButton>
                <LiquidButton href="/dashboard/account" className="px-4 py-2.5">
                  Profile
                  <User size={18} />
              </LiquidButton>
            </div>
          </div>
        </header>

        <section className="relative z-10 flex flex-1 flex-col justify-end px-4 pb-8 sm:px-6 md:px-12 md:pb-16">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-4xl flex-1">
              <div
                className="animate-blur-fade-up mb-6 flex flex-wrap items-center gap-3 text-xs text-white sm:gap-6 sm:text-sm md:mb-8"
                style={animationDelay(300)}
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <Star size={16} className="fill-white sm:h-5 sm:w-5" />
                  98% TASK CLARITY
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock size={16} className="sm:h-5 sm:w-5" />
                  Always-on agents
                </span>
                <span className="inline-flex items-center gap-2">
                  <Calendar size={16} className="sm:h-5 sm:w-5" />
                  May, 2026
                </span>
              </div>

              <h1
                className="animate-blur-fade-up mb-4 max-w-4xl text-3xl font-normal leading-[0.94] tracking-[-0.04em] text-white sm:text-5xl md:mb-6 md:text-6xl lg:text-7xl"
                style={animationDelay(400)}
              >
                Command Every Agent. Work Smarter.
              </h1>

              <p
                className="animate-blur-fade-up mb-6 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg md:mb-12 md:text-xl"
                style={animationDelay(500)}
              >
                A cinematic AI workspace where conversations, memory, automation, and trust signals move in one focused command layer.
              </p>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <Link
                  href="/auth/sign-up"
                  className="animate-blur-fade-up inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-200 sm:px-8 sm:py-3"
                  style={animationDelay(600)}
                >
                  <Play size={18} className="fill-black" />
                  Start Now
                </Link>
                <LiquidButton
                  href="/contact"
                  className="animate-blur-fade-up px-6 py-2.5 sm:px-8 sm:py-3"
                  style={animationDelay(700)}
                >
                  Learn More
                </LiquidButton>
              </div>
            </div>

            <div className="flex w-full items-center gap-3 md:w-auto md:justify-end">
              <LiquidButton
                href="/dashboard/library"
                className="animate-blur-fade-up px-4 py-2.5 sm:px-6 sm:py-3"
                style={animationDelay(800)}
              >
                <ChevronLeft size={18} />
                Library
              </LiquidButton>
              <LiquidButton
                href="/dashboard/chat"
                className="animate-blur-fade-up px-4 py-2.5 sm:px-6 sm:py-3"
                style={animationDelay(900)}
              >
                Chat
                <ChevronRight size={18} />
              </LiquidButton>
            </div>
          </div>
        </section>
      </div>

    </main>
  );
}
