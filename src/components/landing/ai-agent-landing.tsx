"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { LogIn, UserPlus, Play, Sparkles, Menu, X } from "lucide-react";
import BoomerangVideoBg from "./boomerang-video-bg";
import { AgentHeroScene } from "./agent-hero-scene";

const BG_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_131941_d136af49-e243-493a-be14-6ff3f24e09e6.mp4";

export function AiAgentLanding() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const navLinks = [
    { href: "#purpose", label: "Purpose" },
    { href: "#system", label: "The System" },
    { href: "#pricing", label: "Plans" },
  ];

  return (
    <section className="relative w-full min-h-screen sm:h-screen overflow-hidden bg-[#030303] text-white">
      <BoomerangVideoBg src={BG_VIDEO} className="absolute inset-0 w-full h-full opacity-15 mix-blend-screen pointer-events-none" />
      <AgentHeroScene />
      <nav className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 md:px-10 py-4 sm:py-6">
        <div className="flex items-center gap-2 text-zinc-100">
          <span className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight">
            Logicra<sup className="text-[10px] sm:text-xs font-medium">TM</sup>
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1 bg-zinc-950/40 backdrop-blur-md rounded-full pl-6 pr-1 py-1 shadow-xl border border-zinc-800/40">
          {navLinks.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm px-3 py-2 transition-colors ${
                i === 0 ? "font-semibold text-zinc-100" : "font-medium text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </a>
          ))}
          <Link href="/dashboard/chat" className="ml-2 bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
            Try it Live
          </Link>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 text-zinc-300">
          <Link href="/auth/sign-up" className="hidden sm:flex items-center gap-2 text-sm font-medium hover:text-white transition-colors">
            <UserPlus className="w-4 h-4" />
            Sign Me Up!
          </Link>
          <Link href="/auth/sign-in" className="hidden sm:flex items-center gap-2 text-sm font-medium hover:text-white transition-colors">
            <LogIn className="w-4 h-4" />
            Enter
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden relative flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900/80 backdrop-blur-md border border-zinc-800/80 text-zinc-100 transition-all duration-300 hover:bg-zinc-800/90"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <Menu
              className={`w-5 h-5 absolute transition-all duration-300 ${
                menuOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
              }`}
            />
            <X
              className={`w-5 h-5 absolute transition-all duration-300 ${
                menuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-20 transition-opacity duration-300 ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMenuOpen(false)}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      {/* Mobile menu drawer */}
      <div
        className={`lg:hidden fixed top-0 right-0 bottom-0 z-20 w-[85%] max-w-sm bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-850 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full pt-24 px-8 pb-8">
          <div className="flex flex-col gap-1">
            {navLinks.map((link, i) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`text-2xl font-semibold text-zinc-100 py-4 border-b border-zinc-800/40 transition-all duration-500 ${
                  menuOpen ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
                }`}
                style={{ transitionDelay: menuOpen ? `${150 + i * 70}ms` : "0ms" }}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div
            className={`mt-8 flex flex-col gap-4 transition-all duration-500 ${
              menuOpen ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
            }`}
            style={{ transitionDelay: menuOpen ? "400ms" : "0ms" }}
          >
            <Link href="/auth/sign-up" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white sm:hidden">
              <UserPlus className="w-4 h-4" />
              Sign Me Up!
            </Link>
            <Link href="/auth/sign-in" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white sm:hidden">
              <LogIn className="w-4 h-4" />
              Enter
            </Link>
            <Link href="/dashboard/chat" onClick={() => setMenuOpen(false)} className="mt-2 bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-semibold px-5 py-3 rounded-full transition-colors text-center">
              Try it Live
            </Link>
          </div>
        </div>
      </div>

      {/* Hero copy */}
      <div className="relative z-10 flex flex-col items-center text-center pt-24 sm:pt-28 md:pt-32 px-4 sm:px-6">
        <h1
          className="font-normal leading-[0.95] text-zinc-100 text-[2rem] sm:text-4xl md:text-5xl lg:text-[4.75rem] xl:text-[5.25rem] max-w-5xl"
          style={{ fontFamily: "'Neue Haas Grotesk Display Pro 55 Roman', 'Neue Haas Grotesk Text Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: "-0.035em" }}
        >
          Close the rift{" "}
          <span className="text-emerald-400 font-semibold tracking-tight">
            linking
            <br className="hidden sm:block" /> focus and action
          </span>
        </h1>
        <p className="mt-6 sm:mt-8 text-zinc-400 text-sm sm:text-base md:text-lg leading-relaxed max-w-md px-2">
          Shape scattered signals and thoughts into meaningful outcomes via AI-driven productivity workflows.
        </p>
      </div>

      {/* Bottom-left CTA block */}
      <div className="absolute left-4 right-4 sm:right-auto sm:left-6 md:left-10 bottom-6 sm:bottom-8 md:bottom-10 z-10 max-w-sm">
        <div className="flex items-center gap-2 text-emerald-400 mb-3">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-semibold sm:font-medium">
            FocusEngine<sup className="text-[10px]">TM</sup>
          </span>
        </div>
        <p className="text-zinc-400 text-xs leading-relaxed mb-6 max-w-xs font-normal">
          Logicra smoothly unites your daily conversations, memory tracking, and voice instructions, streamlining data paths between services without having to write custom scripts.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/dashboard/chat" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-full transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] text-center">
            Try it Live
          </Link>
          <a href="#purpose" className="text-zinc-300 hover:text-white text-sm font-semibold sm:font-medium transition-colors">
            Know More.
          </a>
        </div>
      </div>

      {/* Bottom-right video link */}
      <div className="hidden sm:flex absolute right-6 md:right-10 bottom-8 md:bottom-10 z-10 items-center gap-2 text-zinc-400 text-sm">
        <button className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800/40 backdrop-blur-sm hover:bg-zinc-700/40 transition-colors">
          <Play className="w-3 h-3 fill-zinc-400 text-zinc-400 ml-0.5" />
        </button>
        <span className="font-medium text-zinc-300">How we build?</span>
        <span className="text-zinc-500">1:35</span>
      </div>
    </section>
  );
}
