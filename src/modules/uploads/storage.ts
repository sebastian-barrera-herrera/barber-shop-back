import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppConfig } from '../../config/app-config.service';

/**
 * Dónde se guardan los archivos. Hoy: disco local (servido en /uploads).
 * Para producción con varios servidores: implementar S3Storage/R2Storage con la misma interfaz.
 */
export interface StorageProvider {
  save(key: string, data: Buffer, contentType: string): Promise<{ url: string }>;
}

export const STORAGE = Symbol('STORAGE');

@Injectable()
export class LocalStorage implements StorageProvider {
  constructor(private readonly config: AppConfig) {}

  get root() {
    return resolve(this.config.get('UPLOADS_DIR'));
  }

  async save(key: string, data: Buffer) {
    const path = join(this.root, key);
    if (!path.startsWith(this.root)) throw new Error('Ruta inválida');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, data);
    return { url: `${this.config.get('API_PUBLIC_URL')}/uploads/${key}` };
  }
}
