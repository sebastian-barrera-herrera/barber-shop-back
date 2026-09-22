import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChannelType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../../common/auth-user';
import { EVENTS, type MessageEvent } from '../../common/events';
import { PrismaService } from '../../prisma/prisma.service';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './channels/channel-adapter';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const MAX_BODY = 2000;

/** Caracteres de control (salvo tabulación y salto de línea). */
const isControl = (code: number) => (code < 32 && code !== 9 && code !== 10) || code === 127;

function cleanBody(body: string): string {
  // Texto plano: se normalizan saltos de línea y se quitan caracteres de control.
  const text = Array.from(body.replace(/\r\n?/g, '\n'))
    .filter((ch) => !isControl(ch.charCodeAt(0)))
    .join('')
    .trim();
  if (!text) throw new BadRequestException('Escribe un mensaje');
  if (text.length > MAX_BODY)
    throw new BadRequestException(`El mensaje puede tener hasta ${MAX_BODY} caracteres`);
  return text;
}

const MESSAGE_SELECT = {
  id: true,
  sender: true,
  body: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
  ) {}

  // ───────────── Cliente (enlace de su cita) ─────────────

  async publicThread(businessId: string, token: string) {
    const customer = await this.customerByToken(businessId, token);
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        businessId_customerId_channel: { businessId, customerId: customer.id, channel: 'WEB' },
      },
    });
    if (!conversation) return { messages: [] };

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: MESSAGE_SELECT,
    });
    // Lo que escribió el negocio queda leído al abrirlo.
    await this.prisma.message.updateMany({
      where: { conversationId: conversation.id, sender: 'STAFF', readAt: null },
      data: { readAt: new Date() },
    });
    return { messages };
  }

  async publicSend(businessId: string, token: string, rawBody: string) {
    const body = cleanBody(rawBody);
    const customer = await this.customerByToken(businessId, token);
    return this.receiveFromChannel(businessId, customer, 'WEB', body);
  }

  /** Entrada común para mensajes de clientes (web hoy; WhatsApp/Instagram mañana). */
  async receiveFromChannel(
    businessId: string,
    customer: { id: string; name: string },
    channel: ChannelType,
    body: string,
    externalId?: string,
  ) {
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { businessId_customerId_channel: { businessId, customerId: customer.id, channel } },
        create: {
          businessId,
          customerId: customer.id,
          channel,
          externalId,
          lastMessageAt: now,
          unreadForBusiness: 1,
        },
        update: { lastMessageAt: now, unreadForBusiness: { increment: 1 } },
      });
      return tx.message.create({
        data: { conversationId: conversation.id, sender: 'CUSTOMER', body },
        select: { ...MESSAGE_SELECT, conversationId: true },
      });
    });
    this.events.emit(EVENTS.messageReceived, {
      businessId,
      conversationId: message.conversationId,
      customerName: customer.name,
      preview: body.slice(0, 120),
    } satisfies MessageEvent);
    const { conversationId: _omit, ...rest } = message;
    return rest;
  }

  // ───────────── Panel ─────────────

  async list(user: AuthUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { businessId: user.bid },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: MESSAGE_SELECT },
      },
    });
    return conversations.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null }));
  }

  async unreadCount(businessId: string) {
    const r = await this.prisma.conversation.aggregate({
      where: { businessId },
      _sum: { unreadForBusiness: true },
    });
    return { unread: r._sum.unreadForBusiness ?? 0 };
  }

  async messages(user: AuthUser, conversationId: string) {
    const conversation = await this.findConversation(user.bid, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 300,
      select: { ...MESSAGE_SELECT, user: { select: { name: true } } },
    });
    return { conversation, messages };
  }

  async markRead(user: AuthUser, conversationId: string) {
    await this.findConversation(user.bid, conversationId);
    await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: { conversationId, sender: 'CUSTOMER', readAt: null },
        data: { readAt: new Date() },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { unreadForBusiness: 0 },
      }),
    ]);
  }

  async send(user: AuthUser, conversationId: string, rawBody: string) {
    const body = cleanBody(rawBody);
    const conversation = await this.findConversation(user.bid, conversationId);
    return this.writeAsStaff(user, conversation, body);
  }

  /** Escribirle primero a un cliente (desde su ficha). */
  async startWith(user: AuthUser, customerId: string, rawBody: string) {
    const body = cleanBody(rawBody);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId: user.bid },
    });
    if (!customer) throw new NotFoundException('No encontramos ese cliente');
    const conversation = await this.prisma.conversation.upsert({
      where: {
        businessId_customerId_channel: { businessId: user.bid, customerId, channel: 'WEB' },
      },
      create: { businessId: user.bid, customerId, channel: 'WEB' },
      update: {},
    });
    const message = await this.writeAsStaff(user, conversation, body);
    return { conversationId: conversation.id, message };
  }

  // ───────────── helpers ─────────────

  private async writeAsStaff(
    user: AuthUser,
    conversation: { id: string; channel: ChannelType },
    body: string,
  ) {
    const [message, updated] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conversation.id, sender: 'STAFF', userId: user.sub, body },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), unreadForBusiness: 0 },
      }),
    ]);
    await this.adapters.find((a) => a.channel === conversation.channel)?.deliver(updated, message);
    return {
      id: message.id,
      sender: message.sender,
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };
  }

  private async findConversation(businessId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, businessId },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
    });
    if (!conversation) throw new NotFoundException('No encontramos esa conversación');
    return conversation;
  }

  private async customerByToken(businessId: string, token: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { businessId, accessTokenHash: sha256(token) },
      select: { customer: { select: { id: true, name: true } } },
    });
    if (!appt) throw new NotFoundException('No encontramos esta cita. Revisa el enlace');
    return appt.customer;
  }
}
