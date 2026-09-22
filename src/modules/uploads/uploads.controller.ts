import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { BusinessId, Roles } from '../../common/decorators';
import { STORAGE, type StorageProvider } from './storage';

const MAX_BYTES = 3 * 1024 * 1024;

/** Se revisa el contenido real del archivo (no solo la extensión o el tipo que dice el navegador). */
export function detectImage(buf: Buffer): { ext: string; type: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', type: 'image/png' };
  }
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' };
  }
  return null;
}

@ApiTags('Archivos')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Subir una imagen (logo, foto de profesional o servicio). JPG, PNG o WebP, máx. 3 MB' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@BusinessId() businessId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Elige una imagen');
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException('Usa una imagen JPG, PNG o WebP');
    return this.storage.save(`${businessId}/${randomUUID()}.${kind.ext}`, file.buffer, kind.type);
  }
}
