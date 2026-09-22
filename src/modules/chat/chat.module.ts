import { Module } from '@nestjs/common';
import { CHANNEL_ADAPTERS } from './channels/channel-adapter';
import { WebChatAdapter } from './channels/web-chat.adapter';
import { ChatController, PublicChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [ChatController, PublicChatController],
  providers: [
    WebChatAdapter,
    // Registro de canales: agregar aquí WhatsAppAdapter, InstagramAdapter, etc.
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (web: WebChatAdapter) => [web],
      inject: [WebChatAdapter],
    },
    ChatService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
