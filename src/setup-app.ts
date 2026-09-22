import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.service';

export const API_PREFIX = 'api/v1';

/** Configuración compartida entre main.ts y los tests e2e. */
export function setupApp(app: INestApplication) {
  const config = app.get(AppConfig);

  // Detrás de un proxy (Docker/Render/Nginx) para que el rate limit vea la IP real.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  return config;
}
