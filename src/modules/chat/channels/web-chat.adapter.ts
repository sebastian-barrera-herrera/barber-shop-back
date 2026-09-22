import { Injectable } from '@nestjs/common';
import type { ChannelAdapter } from './channel-adapter';

/** Chat en la web: el cliente consulta sus mensajes desde su enlace, no hay nada que "empujar". */
@Injectable()
export class WebChatAdapter implements ChannelAdapter {
  readonly channel = 'WEB' as const;

  async deliver() {
    /* entrega por consulta (polling) desde la página de la cita */
  }
}
