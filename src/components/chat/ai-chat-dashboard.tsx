"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useRealtimeConnection } from "@/hooks/use-realtime-connection";
import { usePresence } from "@/hooks/use-presence";
import { useNotifications } from "@/hooks/use-notifications";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ChatMessagesList } from "./chat-messages-list";
import { ChatInputPanel } from "./chat-input-panel";
import { ChatSidebar } from "./chat-sidebar";
import { RealTimeStatusBar } from "./real-time-status-bar";
import { NotificationCenter } from "./notification-center";
import {
  queueChatMessage,
  readOfflineBootstrap,
  saveOfflineBootstrap,
} from "@/lib/offline-store";

type User = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  receipt?: {
    sentAt: string;
    deliveredAt: string | null;
    readAt: string | null;
  } | null;
  attachments?: Array<{ name: string; mimeType: string; url?: string }>;
  reactions?: Array<{ messageId: string; userId: string; emoji: string; createdAt: string }>;
  threadReplies?: Array<{ id: string; messageId: string; userId: string; content: string; createdAt: string }>;
  status?: "sending" | "streaming" | "sent" | "queued" | "failed";
  retryPayload?: {
    message: string;
    imageDataUrl?: string;
    attachments?: Array<{ name: string; mimeType: string; size: number; url?: string }>;
  };
};

type ConversationPayload = {
  conversations: Conversation[];
  memory: string;
  nextCursor?: string | null;
};

type StreamEvent =
  | { type: "conversation"; conversation: Conversation }
  | { type: "user-message"; userMessage: Message; receipt?: Message["receipt"] }
  | { type: "assistant-start"; assistantMessage: Message }
  | { type: "assistant-delta"; id: string; delta: string }
  | { type: "assistant-done"; assistantMessage: Message; receipt?: Message["receipt"] }
  | { type: "done"; conversationId: string; memorySummary: string }
  | { type: "error"; error: string };

export function AiChatDashboard({ user }: { user: User }) {
  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedAssistant] = useState<"chatgpt" | "gemini" | "auto">("auto");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<Array<{ name: string; mimeType: string; previewUrl: string; size: number }>>([]);

  // Real-time hooks
  const { status: realtimeStatus, error: realtimeError, reconnect } = useRealtimeConnection({
    onEvent: handleRealtimeEvent,
  });

  const { presence } = usePresence({
    userId: user.id,
    conversationId: activeConversationId,
  });

  const {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useNotifications({
    userId: user.id,
  });

  const { typingUsers } = useTypingIndicator({
    conversationId: activeConversationId,
    userId: user.id,
  });

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Computed values
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const workspaceStats = useMemo(() => ({
    messages: messages.length,
    memory: memory ? `${memory.split("\n").length} notes` : "empty",
    intent: "general_chat",
    presence: presence?.status ?? "offline",
    sync: realtimeStatus === "connected" ? "online" : realtimeStatus === "connecting" ? "connecting" : "offline",
    role: /dev|engineer|tech|code/i.test(user.email) ? "developer" : "manager",
    latency: 0,
    sentiment: 0,
    churnRisk: 0,
  }), [messages.length, memory, presence?.status, realtimeStatus, user.email]);

  // Real-time event handler
  function handleRealtimeEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case "receipt":
        const receipt = event.receipt as { messageId: string; sentAt: string; deliveredAt: string | null; readAt: string | null };
        setMessages(prev =>
          prev.map(message =>
            message.id === receipt.messageId
              ? { ...message, receipt }
              : message
          )
        );
        break;
      case "notification":
        addNotification(event.notification as {
          id: string;
          kind: "message" | "task" | "mention" | "deadline" | "security";
          title: string;
          body: string;
          conversationId?: string | null;
          messageId?: string | null;
          createdAt: string;
          readAt: string | null;
        });
        break;
    }
  }

  // Load initial data
  useEffect(() => {
    const loadConversations = async () => {
      setLoadingConversations(true);
      try {
        const response = await fetch("/api/chat/conversations", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load conversations");
        const payload = await response.json() as ConversationPayload;
        setConversations(payload.conversations);
        setMemory(payload.memory);
        setActiveConversationId(prev => prev ?? payload.conversations[0]?.id ?? null);
        const bootstrapResponse = await fetch("/api/offline/bootstrap", { cache: "no-store" });
        if (bootstrapResponse.ok) {
          await saveOfflineBootstrap(await bootstrapResponse.json());
        }
      } catch (error) {
        const cached = await readOfflineBootstrap().catch(() => undefined);
        if (cached) {
          setConversations(cached.conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: String(conversation.updatedAt),
            updatedAt: String(conversation.updatedAt),
          })));
          setActiveConversationId(prev => prev ?? cached.conversations[0]?.id ?? null);
          toast.message("Loaded cached conversations for offline use.");
        } else {
          toast.error(error instanceof Error ? error.message : "Unable to fetch conversations");
        }
      } finally {
        setLoadingConversations(false);
      }
    };

    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const response = await fetch(`/api/chat/conversations/${activeConversationId}/messages`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load messages");
        const payload = await response.json() as { messages: Message[] };
        setMessages(payload.messages);
      } catch (error) {
        const cached = await readOfflineBootstrap().catch(() => undefined);
        const cachedMessages = cached?.history.find((item) => item.conversationId === activeConversationId)?.messages;
        if (cachedMessages) {
          setMessages(cachedMessages.map((message) => ({
            id: message.id ?? crypto.randomUUID(),
            role: message.role,
            content: message.content,
            createdAt: String(message.createdAt),
            status: "sent",
          })));
        } else {
          toast.error(error instanceof Error ? error.message : "Unable to fetch messages");
        }
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessages();
  }, [activeConversationId]);

  // Camera functions
  const startCamera = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraEnabled(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to access camera.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraEnabled(false);
  }, []);

  // Message handlers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSendMessage = useCallback(async (message: string, imageDataUrl?: string, _attachments?: File[]) => {
    if (!message.trim() || sending) return;

    setSending(true);
    const tempUserId = `temp-user-${crypto.randomUUID()}`;
    const tempAssistantId = `temp-assistant-${crypto.randomUUID()}`;

    try {
      const attachmentsData = pendingPreviews.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        size: item.size,
        url: item.previewUrl,
      }));

      const optimisticUserMessage: Message = {
        id: tempUserId,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
        attachments: pendingPreviews.map((item) => ({
          name: item.name,
          mimeType: item.mimeType,
          url: item.previewUrl,
        })),
        status: "sending",
        retryPayload: { message, imageDataUrl, attachments: attachmentsData },
      };

      setMessages(prev => [...prev, optimisticUserMessage]);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueChatMessage({
          conversationId: activeConversationId ?? undefined,
          message,
          assistant: selectedAssistant,
          imageDataUrl: imageDataUrl || undefined,
          attachments: attachmentsData.length ? attachmentsData : undefined,
        });
        setMessages(prev =>
          prev.map((item) => item.id === tempUserId ? { ...item, status: "queued" } : item)
        );
        toast.message("You are offline. Message queued and will sync when connection returns.");
        setPendingFiles([]);
        setPendingPreviews([]);
        return;
      }

      const response = await fetch("/api/chat/send/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId ?? undefined,
          message,
          assistant: selectedAssistant,
          imageDataUrl: imageDataUrl || undefined,
          attachments: attachmentsData.length ? attachmentsData : undefined,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Failed to send message");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleStreamEvent = (event: StreamEvent) => {
        switch (event.type) {
          case "conversation":
            setConversations(prev => [event.conversation, ...prev]);
            setActiveConversationId(event.conversation.id);
            break;
          case "user-message":
            setMessages(prev =>
              prev.map((item) =>
                item.id === tempUserId
                  ? { ...event.userMessage, attachments: optimisticUserMessage.attachments, receipt: event.receipt, status: "sent" }
                  : item,
              ),
            );
            break;
          case "assistant-start":
            setMessages(prev => [...prev, { ...event.assistantMessage, id: event.assistantMessage.id || tempAssistantId, status: "streaming" }]);
            break;
          case "assistant-delta":
            setMessages(prev =>
              prev.map((item) =>
                item.id === event.id ? { ...item, content: `${item.content}${event.delta}`, status: "streaming" } : item,
              ),
            );
            break;
          case "assistant-done":
            setMessages(prev =>
              prev.map((item) =>
                item.id === event.assistantMessage.id
                  ? { ...event.assistantMessage, receipt: event.receipt, status: "sent" }
                  : item,
              ),
            );
            break;
          case "done":
            setActiveConversationId(event.conversationId);
            setMemory(event.memorySummary);
            break;
          case "error":
            throw new Error(event.error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const eventName = rawEvent.match(/^event: (.+)$/m)?.[1];
          const data = rawEvent.match(/^data: (.+)$/m)?.[1];
          if (!eventName || !data) continue;
          handleStreamEvent({ type: eventName, ...JSON.parse(data) } as StreamEvent);
        }
      }

      setPendingFiles([]);
      setPendingPreviews([]);
    } catch (error) {
      try {
        await queueChatMessage({
          conversationId: activeConversationId ?? undefined,
          message,
          assistant: selectedAssistant,
          imageDataUrl: imageDataUrl || undefined,
          attachments: pendingPreviews.length
            ? pendingPreviews.map((item) => ({
                name: item.name,
                mimeType: item.mimeType,
                size: item.size,
                url: item.previewUrl,
              }))
            : undefined,
        });
        setMessages(prev =>
          prev.map((item) => item.id === tempUserId ? { ...item, status: "queued" } : item)
        );
        toast.message("Message queued. It will sync when your connection is back.");
      } catch {
        setMessages(prev =>
          prev.map((item) => item.id === tempUserId ? { ...item, status: "failed" } : item)
        );
        toast.error(error instanceof Error ? error.message : "Unable to send message");
      }
    } finally {
      setSending(false);
    }
  }, [sending, activeConversationId, selectedAssistant, pendingPreviews]);

  const handleFileSelect = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const previews = await Promise.all(
      fileArray.map(file =>
        new Promise<{ name: string; mimeType: string; previewUrl: string; size: number }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              previewUrl: typeof reader.result === "string" ? reader.result : "",
              size: file.size,
            });
          reader.readAsDataURL(file);
        })
      )
    );

    setPendingFiles(fileArray);
    setPendingPreviews(previews);

    // Upload files
    try {
      for (const file of fileArray) {
        await fetch("/api/chat/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            previewUrl: previews.find(p => p.name === file.name)?.previewUrl || "",
          }),
        });
      }
      toast.success("Files attached and staged for chat sharing.");
    } catch {
      toast.error("Unable to upload files");
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
    setPendingPreviews(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreateConversation = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });

      if (!response.ok) throw new Error("Failed to create chat");

      const payload = await response.json() as { conversation: Conversation };
      setConversations(prev => [payload.conversation, ...prev]);
      setActiveConversationId(payload.conversation.id);
      setMessages([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create chat");
    }
  }, []);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete conversation");

      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      setActiveConversationId(current => {
        if (current !== conversationId) return current;
        return conversations.find(conv => conv.id !== conversationId)?.id ?? null;
      });
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete conversation");
    }
  }, [conversations]);

  const handleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      const response = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (!response.ok) return;

      const payload = await response.json() as {
        reaction: { messageId: string; userId: string; emoji: string; createdAt: string }
      };

      setMessages(current =>
        current.map(message =>
          message.id === messageId
            ? { ...message, reactions: [...(message.reactions ?? []), payload.reaction] }
            : message
        )
      );
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }
  }, []);

  const handleExplainMessage = useCallback(async (message: Message) => {
    if (message.role !== "assistant") return;
    const sourceLinks = activeConversation ? [`Conversation:${activeConversation.id}`] : ["Conversation:unknown"];
    try {
      const response = await fetch("/api/trust/xai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: message.id,
          question: "Why this answer?",
          answer: message.content,
          reasoning: "Response was generated from recent chat history, memory summary, and active model routing strategy.",
          sources: sourceLinks,
          complianceFlags: [],
          modelVersion: selectedAssistant === "auto" ? "auto-routed" : selectedAssistant,
        }),
      });
      if (response.ok) {
        toast.success("Explainable log saved. Check Growth & Trust page.");
      } else {
        toast.error("Unable to generate explanation log.");
      }
    } catch {
      toast.error("Unable to generate explanation log.");
    }
  }, [activeConversation, selectedAssistant]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <main className="dashboard-surface min-h-screen p-4 text-foreground md:p-6">
        <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4 md:h-[calc(100vh-3rem)] md:gap-6 lg:flex-row">
        {/* Real-time Status Bar */}
        <div className="md:hidden">
          <RealTimeStatusBar
            status={realtimeStatus}
            error={realtimeError}
            onRetry={reconnect}
            className="min-h-12"
          />
        </div>

        {/* Sidebar */}
        <div className="hidden w-80 lg:block">
          <ChatSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            workspaceStats={workspaceStats}
            onSelectConversation={setActiveConversationId}
            onCreateConversation={handleCreateConversation}
            onDeleteConversation={handleDeleteConversation}
            isLoading={loadingConversations}
            user={user}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Desktop Status Bar */}
          <div className="hidden md:block">
            <RealTimeStatusBar
              status={realtimeStatus}
              error={realtimeError}
              onRetry={reconnect}
              className="min-h-12"
            />
          </div>

          {/* Messages */}
            <ChatMessagesList
              messages={messages}
              currentUserId={user.id}
              isLoading={loadingMessages}
              typingUsers={typingUsers}
              onMessageReaction={handleMessageReaction}
              onExplainMessage={handleExplainMessage}
              onNewChat={handleCreateConversation}
              onRetryMessage={(failedMessage) => {
                if (failedMessage.retryPayload) {
                  void handleSendMessage(
                    failedMessage.retryPayload.message,
                    failedMessage.retryPayload.imageDataUrl,
                  );
                }
              }}
            />

          {/* Input Panel */}
          <ChatInputPanel
            onSendMessage={handleSendMessage}
            onFileSelect={handleFileSelect}
            isSending={sending}
            cameraEnabled={cameraEnabled}
            onCameraToggle={() => cameraEnabled ? stopCamera() : startCamera()}
            pendingFiles={pendingFiles}
            onRemoveFile={handleRemoveFile}
          />
        </div>

        {/* Notification Center */}
        <div className="fixed bottom-4 right-4 z-50 md:static">
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDismiss={removeNotification}
          />
        </div>

        {/* Hidden Video Element for Camera */}
        <video
          ref={videoRef}
          className="hidden"
          autoPlay
          muted
          playsInline
        />
      </div>
    </main>
    </ErrorBoundary>
  );
}
