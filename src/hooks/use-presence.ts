"use client";

import { useCallback, useEffect, useState } from "react";

export type PresenceStatus = "online" | "away" | "offline";

export interface PresenceData {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
  typingConversationId: string | null;
  typing: boolean;
  updatedAt: string;
}

export interface UsePresenceOptions {
  userId: string;
  conversationId?: string | null;
  onPresenceUpdate?: (presence: PresenceData | null) => void;
}

export function usePresence(options: UsePresenceOptions) {
  const { conversationId, onPresenceUpdate } = options;
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const updatePresence = useCallback(
    async (status: PresenceStatus, typing = false) => {
      try {
        const response = await fetch("/api/chat/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, conversationId, typing }),
        });

        if (response.ok) {
          const data = await response.json();
          setPresence(data.presence || null);
          setIsTyping(typing);
          onPresenceUpdate?.(data.presence || null);
        }
      } catch (error) {
        console.error("Failed to update presence:", error);
      }
    },
    [conversationId, onPresenceUpdate]
  );

  const setOnline = useCallback(() => updatePresence("online", false), [updatePresence]);
  const setAway = useCallback(() => updatePresence("away", false), [updatePresence]);
  const setOffline = useCallback(() => updatePresence("offline", false), [updatePresence]);

  const startTyping = useCallback(() => {
    updatePresence("online", true);
  }, [updatePresence]);

  const stopTyping = useCallback(() => {
    updatePresence("online", false);
  }, [updatePresence]);

  // Auto-update presence based on window focus
  useEffect(() => {
    const handleFocus = () => setOnline();
    const handleBlur = () => setAway();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [setOnline, setAway]);

  // Load initial presence
  useEffect(() => {
    const loadPresence = async () => {
      try {
        const response = await fetch("/api/chat/presence");
        if (response.ok) {
          const data = await response.json();
          setPresence(data.presence || null);
          onPresenceUpdate?.(data.presence || null);
        }
      } catch (error) {
        console.error("Failed to load presence:", error);
      }
    };

    loadPresence();
  }, [onPresenceUpdate]);

  return {
    presence,
    isTyping,
    status: presence?.status || "offline",
    setOnline,
    setAway,
    setOffline,
    startTyping,
    stopTyping,
    updatePresence,
  };
}