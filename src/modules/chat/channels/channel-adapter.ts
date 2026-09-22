import type { ChannelType, Conversation, Message } from '@prisma/client';

/**
 * Un canal de mensajería. El chat guarda siempre en Conversation/Message;
 * el adaptador solo entrega hacia afuera lo que escribe el equipo.
 *
 * Para conectar WhatsApp/Instagram/Messenger/Telegram:
 *  1. Implementar esta interfaz (enviar por la API del proveedor usando conversation.externalId).
 *  2. Crear un webhook que traduzca los mensajes entrantes a ChatService.receiveFromChannel(...).
 *  3. Registrar el adaptador en ChatModule.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;
  deliver(conversation: Conversation, message: Message): Promise<void>;
}

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
