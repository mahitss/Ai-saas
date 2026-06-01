import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  chatAuditLog,
  chatCallSession,
  chatIntegrationLink,
  chatNotification,
  chatPresence,
  chatReaction,
  chatReceipt,
  chatThreadReply,
  chatUpload,
} from "@/db/schema";
import { logger } from "@/lib/server/logger";

type PresenceStatus = "online" | "away" | "offline";

type ChatPresence = {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
  typingConversationId: string | null;
  typing: boolean;
  updatedAt: string;
};

type ChatReceipt = {
  messageId: string;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};

type ChatNotification = {
  id: string;
  userId: string;
  kind: "message" | "task" | "mention" | "deadline" | "security";
  title: string;
  body: string;
  conversationId?: string | null;
  messageId?: string | null;
  createdAt: string;
  readAt: string | null;
};

type ChatUpload = {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
};

type ChatAuditLog = {
  id: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

type ChatReaction = {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
};

type ChatThreadReply = {
  id: string;
  messageId: string;
  userId: string;
  content: string;
  createdAt: string;
};

type ChatIntegrationLink = {
  id: string;
  userId: string;
  provider: "slack" | "discord" | "github" | "calendar";
  target: string;
  status: "connected" | "pending" | "disabled";
  createdAt: string;
  updatedAt: string;
};

type ChatCallSession = {
  id: string;
  userId: string;
  roomName: string;
  mode: "one_to_one" | "group";
  status: "idle" | "ringing" | "active" | "ended";
  screenSharing: boolean;
  recording: boolean;
  participants: string[];
  updatedAt: string;
};

type RealtimeEvent =
  | { type: "presence"; presence: ChatPresence }
  | { type: "typing"; userId: string; conversationId: string | null; typing: boolean; updatedAt: string }
  | { type: "receipt"; receipt: ChatReceipt }
  | { type: "notification"; notification: ChatNotification }
  | { type: "upload"; upload: ChatUpload }
  | { type: "audit"; audit: ChatAuditLog }
  | { type: "reaction"; reaction: ChatReaction }
  | { type: "thread_reply"; reply: ChatThreadReply };

const eventListenersByUser = new Map<string, Set<(event: RealtimeEvent) => void>>();
const MAX_LISTENERS_PER_USER = 20;

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function safeDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function pushToListeners(userId: string, event: RealtimeEvent) {
  const listeners = eventListenersByUser.get(userId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      logger.error("Realtime listener failed", { userId, eventType: event.type, error });
    }
  }
}

function parseParticipants(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapPresence(row: typeof chatPresence.$inferSelect): ChatPresence {
  return {
    userId: row.userId,
    status: row.status as PresenceStatus,
    lastSeenAt: row.lastSeenAt.toISOString(),
    typingConversationId: row.typingConversationId,
    typing: row.typing,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReceipt(row: typeof chatReceipt.$inferSelect): ChatReceipt {
  return {
    messageId: row.messageId,
    sentAt: row.sentAt.toISOString(),
    deliveredAt: toIso(row.deliveredAt),
    readAt: toIso(row.readAt),
  };
}

function mapNotification(row: typeof chatNotification.$inferSelect): ChatNotification {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as ChatNotification["kind"],
    title: row.title,
    body: row.body,
    conversationId: row.conversationId,
    messageId: row.messageId,
    createdAt: row.createdAt.toISOString(),
    readAt: toIso(row.readAt),
  };
}

function mapIntegration(row: typeof chatIntegrationLink.$inferSelect): ChatIntegrationLink {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as ChatIntegrationLink["provider"],
    target: row.target,
    status: row.status as ChatIntegrationLink["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCallSession(row: typeof chatCallSession.$inferSelect): ChatCallSession {
  return {
    id: row.id,
    userId: row.userId,
    roomName: row.roomName,
    mode: row.mode as ChatCallSession["mode"],
    status: row.status as ChatCallSession["status"],
    screenSharing: row.screenSharing,
    recording: row.recording,
    participants: parseParticipants(row.participants),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerRealtimeListener(userId: string, listener: (event: RealtimeEvent) => void) {
  const listeners = eventListenersByUser.get(userId) ?? new Set<(event: RealtimeEvent) => void>();
  if (listeners.size >= MAX_LISTENERS_PER_USER) {
    const oldest = listeners.values().next().value as ((event: RealtimeEvent) => void) | undefined;
    if (oldest) listeners.delete(oldest);
  }
  listeners.add(listener);
  eventListenersByUser.set(userId, listeners);

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const current = eventListenersByUser.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) eventListenersByUser.delete(userId);
  };
}

export async function setPresence(userId: string, status: PresenceStatus, typingConversationId: string | null = null, typing = false) {
  const lastSeenAt = new Date();
  const updatedAt = new Date();
  const [row] = await db
    .insert(chatPresence)
    .values({ userId, status, lastSeenAt, typingConversationId, typing, updatedAt })
    .onConflictDoUpdate({
      target: chatPresence.userId,
      set: { status, lastSeenAt, typingConversationId, typing, updatedAt },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert presence");
  const presence = mapPresence(row);
  pushToListeners(userId, { type: "presence", presence });
  return presence;
}

export async function getPresence(userId: string) {
  const [row] = await db.select().from(chatPresence).where(eq(chatPresence.userId, userId)).limit(1);
  return row ? mapPresence(row) : null;
}

export async function setTyping(userId: string, conversationId: string | null, typing: boolean) {
  const current = await getPresence(userId);
  const updated = await setPresence(userId, typing ? "online" : (current?.status ?? "online"), conversationId, typing);
  pushToListeners(userId, { type: "typing", userId, conversationId, typing, updatedAt: updated.updatedAt });
  return updated;
}

export async function markMessageSent(messageId: string, userId: string) {
  const sentAt = new Date();
  const deliveredAt = new Date();
  const [row] = await db
    .insert(chatReceipt)
    .values({ messageId, userId, sentAt, deliveredAt, readAt: null })
    .onConflictDoUpdate({ target: chatReceipt.messageId, set: { deliveredAt } })
    .returning();
  const receipt = mapReceipt(row);
  pushToListeners(userId, { type: "receipt", receipt });
  return receipt;
}

export async function markMessageRead(messageId: string, userId: string) {
  const existing = await getReceipt(messageId);
  const sentAt = safeDate(existing?.sentAt) ?? new Date();
  const deliveredAt = safeDate(existing?.deliveredAt) ?? new Date();
  const readAt = new Date();
  const [row] = await db
    .insert(chatReceipt)
    .values({ messageId, userId, sentAt, deliveredAt, readAt })
    .onConflictDoUpdate({ target: chatReceipt.messageId, set: { deliveredAt, readAt } })
    .returning();

  if (!row) throw new Error("Failed to create receipt");
  const receipt = mapReceipt(row);
  pushToListeners(userId, { type: "receipt", receipt });
  return receipt;
}

export async function getReceipt(messageId: string) {
  const [row] = await db.select().from(chatReceipt).where(eq(chatReceipt.messageId, messageId)).limit(1);
  return row ? mapReceipt(row) : null;
}

export async function addNotification(
  userId: string,
  notification: Omit<ChatNotification, "id" | "userId" | "createdAt" | "readAt"> & { readAt?: string | null },
) {
  const [row] = await db
    .insert(chatNotification)
    .values({
      id: crypto.randomUUID(),
      userId,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      conversationId: notification.conversationId ?? null,
      messageId: notification.messageId ?? null,
      createdAt: new Date(),
      readAt: safeDate(notification.readAt),
    })
    .returning();
  if (!row) throw new Error("Failed to create notification");
  const next = mapNotification(row);
  pushToListeners(userId, { type: "notification", notification: next });
  return next;
}

export async function listNotifications(userId: string) {
  const rows = await db.select().from(chatNotification).where(eq(chatNotification.userId, userId)).orderBy(desc(chatNotification.createdAt)).limit(50);
  return rows.map(mapNotification);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const [row] = await db
    .update(chatNotification)
    .set({ readAt: new Date() })
    .where(eq(chatNotification.id, notificationId))
    .returning();
  return row ? mapNotification(row) : null;
}

export async function addUpload(userId: string, upload: Omit<ChatUpload, "id" | "userId" | "createdAt"> & { expiresAt?: string }) {
  const [row] = await db
    .insert(chatUpload)
    .values({
      ...upload,
      id: crypto.randomUUID(),
      userId,
      expiresAt: new Date(upload.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to create upload");
  const next = { ...row, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString() };
  pushToListeners(userId, { type: "upload", upload: next });
  return next;
}

export async function listUploads(userId: string) {
  const rows = await db.select().from(chatUpload).where(eq(chatUpload.userId, userId)).orderBy(desc(chatUpload.createdAt)).limit(30);
  return rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString() }));
}

export async function addAuditLog(userId: string, audit: Omit<ChatAuditLog, "id" | "userId" | "createdAt">) {
  const [row] = await db
    .insert(chatAuditLog)
    .values({ ...audit, id: crypto.randomUUID(), userId, createdAt: new Date() })
    .returning();
  if (!row) throw new Error("Failed to create audit log");
  const next = { ...row, createdAt: row.createdAt.toISOString() };
  pushToListeners(userId, { type: "audit", audit: next });
  return next;
}

export async function listAuditLogs(userId: string) {
  const rows = await db.select().from(chatAuditLog).where(eq(chatAuditLog.userId, userId)).orderBy(desc(chatAuditLog.createdAt)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getChatRealtimeSnapshot(userId: string) {
  const [presence, notifications, uploads, auditLogs, reactions, threadReplies, integrations, callSessions] = await Promise.all([
    getPresence(userId),
    listNotifications(userId),
    listUploads(userId),
    listAuditLogs(userId),
    listReactions(userId),
    listThreadReplies(userId),
    listIntegrations(userId),
    listCallSessions(userId),
  ]);
  return { presence, notifications, uploads, auditLogs, reactions, threadReplies, integrations, callSessions };
}

export async function addReaction(userId: string, messageId: string, emoji: string) {
  const [row] = await db
    .insert(chatReaction)
    .values({ id: crypto.randomUUID(), messageId, userId, emoji, createdAt: new Date() })
    .returning();
  if (!row) throw new Error("Failed to create reaction");
  const reaction = { ...row, createdAt: row.createdAt.toISOString() };
  pushToListeners(userId, { type: "reaction", reaction });
  await addAuditLog(userId, { action: "reaction", targetType: "message", targetId: messageId, detail: emoji });
  return reaction;
}

export async function listReactions(userId: string) {
  const rows = await db.select().from(chatReaction).where(eq(chatReaction.userId, userId)).orderBy(desc(chatReaction.createdAt)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function addThreadReply(userId: string, messageId: string, content: string) {
  const [row] = await db
    .insert(chatThreadReply)
    .values({ id: crypto.randomUUID(), messageId, userId, content, createdAt: new Date() })
    .returning();
  if (!row) throw new Error("Failed to create thread reply");
  const reply = { ...row, createdAt: row.createdAt.toISOString() };
  pushToListeners(userId, { type: "thread_reply", reply });
  return reply;
}

export async function listThreadReplies(userId: string) {
  const rows = await db.select().from(chatThreadReply).where(eq(chatThreadReply.userId, userId)).orderBy(desc(chatThreadReply.createdAt)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function addIntegration(userId: string, provider: ChatIntegrationLink["provider"], target: string) {
  const [existing] = await db
    .select()
    .from(chatIntegrationLink)
    .where(and(eq(chatIntegrationLink.userId, userId), eq(chatIntegrationLink.provider, provider), eq(chatIntegrationLink.target, target)))
    .orderBy(desc(chatIntegrationLink.updatedAt))
    .limit(1);
  if (existing?.provider === provider && existing.target === target) return mapIntegration(existing);

  const [row] = await db
    .insert(chatIntegrationLink)
    .values({ id: crypto.randomUUID(), userId, provider, target, status: "connected", createdAt: new Date(), updatedAt: new Date() })
    .returning();
  if (!row) throw new Error("Failed to create integration");
  return mapIntegration(row);
}

export async function listIntegrations(userId: string) {
  const rows = await db.select().from(chatIntegrationLink).where(eq(chatIntegrationLink.userId, userId)).orderBy(desc(chatIntegrationLink.updatedAt)).limit(20);
  return rows.map(mapIntegration);
}

export async function createCallSession(userId: string, session: Omit<ChatCallSession, "id" | "userId" | "updatedAt">) {
  const [row] = await db
    .insert(chatCallSession)
    .values({
      ...session,
      id: crypto.randomUUID(),
      userId,
      participants: JSON.stringify(session.participants),
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to create call session");
  return mapCallSession(row);
}

export async function listCallSessions(userId: string) {
  const rows = await db.select().from(chatCallSession).where(eq(chatCallSession.userId, userId)).orderBy(desc(chatCallSession.updatedAt)).limit(20);
  return rows.map(mapCallSession);
}

export async function updateCallSession(userId: string, sessionId: string, updates: Partial<Omit<ChatCallSession, "id" | "userId">>) {
  const [row] = await db
    .update(chatCallSession)
    .set({
      ...updates,
      participants: updates.participants ? JSON.stringify(updates.participants) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(chatCallSession.id, sessionId))
    .returning();
  return row ? mapCallSession(row) : null;
}

export type { ChatPresence, ChatReceipt, ChatNotification, ChatUpload, ChatAuditLog, RealtimeEvent, PresenceStatus };
