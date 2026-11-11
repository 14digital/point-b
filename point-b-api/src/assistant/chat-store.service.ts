import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth';
import { CHAT_KEY } from './assistant.dto';
import type { Turn } from './assistant.service';

/** How long the AI stays quiet after a team member writes, before it picks the chat up again. */
export const AGENT_WINDOW_MS = 15 * 60_000;

const preview = (s: string) => (s.length > 140 ? `${s.slice(0, 140)}…` : s);

/** Saves every chat-bubble conversation, and lets the team read them and reply. */
@Injectable()
export class ChatStoreService {
  constructor(private prisma: PrismaService) {}

  private live(c: { agentUntil: Date | null }) { return !!c.agentUntil && c.agentUntil.getTime() > Date.now(); }

  /** Saves the person's message, creating the conversation on the first one. Says whether a team member has it. */
  async addUserMessage(key: string, content: string, user: AuthUser | undefined, where: { page?: string; country?: string; city?: string }) {
    const who = user && user.role !== 'ADMIN' ? { userId: user.id, name: user.name, email: user.email, role: user.role } : {};
    const now = new Date();
    const conv = await this.prisma.chatConversation.upsert({
      where: { key },
      create: { key, ...who, page: where.page, country: where.country, city: where.city, lastMessage: preview(content), lastMessageAt: now, unreadByTeam: 1 },
      update: { ...who, page: where.page, ...(where.country ? { country: where.country, city: where.city } : {}), lastMessage: preview(content), lastMessageAt: now, unreadByTeam: { increment: 1 } },
    });
    await this.prisma.chatMessage.create({ data: { conversationId: conv.id, role: 'user', content } });
    return { conversation: conv, agent: this.live(conv) };
  }

  async history(conversationId: string): Promise<Turn[]> {
    const rows = await this.prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 30, select: { role: true, content: true } });
    return rows.reverse().map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
  }

  async addAssistantMessage(conversationId: string, content: string) {
    const text = content.trim();
    if (!text) return;
    await this.prisma.chatMessage.create({ data: { conversationId, role: 'assistant', content: text } });
    await this.prisma.chatConversation.update({ where: { id: conversationId }, data: { lastMessage: preview(text), lastMessageAt: new Date() } });
  }

  /** For the person's own browser: their messages and every reply, all shown as from POINT B. */
  async forVisitor(key: string, after?: string) {
    if (!CHAT_KEY.test(key)) throw new BadRequestException('Invalid chat');
    const conv = await this.prisma.chatConversation.findUnique({ where: { key }, select: { id: true } });
    if (!conv) return { messages: [] };
    const since = after ? new Date(after) : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId: conv.id, ...(since && !isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, role: true, content: true, createdAt: true },
    });
    return { messages: rows.map((m) => ({ id: m.id, role: m.role === 'user' ? 'user' : 'assistant', content: m.content, at: m.createdAt })) };
  }

  // ---- The team's inbox ----

  async list() {
    const rows = await this.prisma.chatConversation.findMany({ orderBy: { lastMessageAt: 'desc' }, take: 300, include: { _count: { select: { messages: true } } } });
    return rows.map(({ key: _k, _count, ...c }) => ({ ...c, messageCount: _count.messages, mode: this.live(c) ? 'agent' : 'ai' }));
  }

  async open(id: string) {
    const conv = await this.prisma.chatConversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Chat not found');
    const [messages] = await Promise.all([
      this.prisma.chatMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, role: true, content: true, agentName: true, createdAt: true } }),
      conv.unreadByTeam ? this.prisma.chatConversation.update({ where: { id }, data: { unreadByTeam: 0 } }) : null,
    ]);
    const { key: _k, ...rest } = conv;
    return { ...rest, unreadByTeam: 0, mode: this.live(conv) ? 'agent' : 'ai', messages };
  }

  /** A team member replies. The AI stays quiet while they're in the chat. */
  async reply(id: string, admin: AuthUser, content: string) {
    const text = content.trim();
    if (!text) throw new BadRequestException('Write a message first.');
    const conv = await this.prisma.chatConversation.findUnique({ where: { id }, select: { id: true } });
    if (!conv) throw new NotFoundException('Chat not found');
    await this.prisma.chatMessage.create({ data: { conversationId: id, role: 'agent', content: text, agentName: admin.name } });
    await this.prisma.chatConversation.update({ where: { id }, data: { agentUntil: new Date(Date.now() + AGENT_WINDOW_MS), agentId: admin.id, agentName: admin.name, lastMessage: preview(text), lastMessageAt: new Date(), unreadByTeam: 0 } });
    return this.open(id);
  }

  async setMode(id: string, admin: AuthUser, mode: 'agent' | 'ai') {
    const conv = await this.prisma.chatConversation.findUnique({ where: { id }, select: { id: true } });
    if (!conv) throw new NotFoundException('Chat not found');
    await this.prisma.chatConversation.update({ where: { id }, data: mode === 'agent' ? { agentUntil: new Date(Date.now() + AGENT_WINDOW_MS), agentId: admin.id, agentName: admin.name } : { agentUntil: null } });
    return this.open(id);
  }

  async unread() {
    return { chats: await this.prisma.chatConversation.count({ where: { unreadByTeam: { gt: 0 } } }) };
  }
}
