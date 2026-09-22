import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/auth-user';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { passwordResetEmail } from '../notifications/email/platform-templates';
import { hashPassword, verifyPassword } from './password';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: AuthUser['role'];
  businessId: string;
  professionalId: string | null;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';
const RESET_TTL_MS = 60 * 60_000;
const INVALID_RESET = 'El enlace ya no sirve. Pide uno nuevo desde "Olvidé mi contraseña"';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  /** Hash de relleno: se verifica aunque el usuario no exista para no revelar qué correos están registrados. */
  private dummyHash?: Promise<string>;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  /** Abre sesión para un usuario ya verificado (p. ej. recién registrado). */
  async startSession(userId: string, meta: SessionMeta = {}): Promise<Session> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { professional: { select: { id: true } } },
    });
    return this.issueSession(user, meta);
  }

  /**
   * "Olvidé mi contraseña". Responde igual exista o no el correo, para no revelar
   * quién está registrado. Se guarda solo el hash del token.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { business: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || !user.business.isActive) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Un enlace vigente a la vez: pedir otro invalida los anteriores.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);

    const url = `${this.config.get('WEB_URL')}/restablecer?token=${encodeURIComponent(token)}`;
    const email_ = passwordResetEmail({
      platform: this.config.get('PLATFORM_NAME'),
      name: user.name,
      url,
    });
    if (!this.mail.enabled) {
      this.logger.warn('SMTP no configurado: no se pudo enviar el enlace para restablecer.');
      return;
    }
    await this.mail.send({ to: user.email, ...email_ }).catch((err: Error) => {
      this.logger.error(`No se pudo enviar el correo de restablecer: ${err.message}`);
    });
  }

  /** Cambia la contraseña con el token del correo y cierra todas las sesiones abiertas. */
  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_RESET);
    }
    const passwordHash = await hashPassword(password);
    // Marcado condicional: dos clics simultáneos no pueden usar el mismo enlace.
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw new BadRequestException(INVALID_RESET);
    await this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } });
    await this.revokeAll(stored.userId);
  }

  async login(email: string, password: string, meta: SessionMeta = {}): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { professional: { select: { id: true } }, business: { select: { isActive: true } } },
    });

    const hash =
      user?.passwordHash ??
      (await (this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'))));
    const valid = await verifyPassword(hash, password);
    if (!user || !valid || !user.isActive || !user.business.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user, meta);
  }

  /**
   * Rota el refresh token: el usado se revoca y se entrega uno nuevo.
   * Si llega un token ya revocado (posible robo), se cierran todas las sesiones del usuario.
   */
  async refresh(rawToken: string | undefined, meta: SessionMeta = {}): Promise<Session> {
    if (!rawToken) throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: {
        user: {
          include: {
            professional: { select: { id: true } },
            business: { select: { isActive: true } },
          },
        },
      },
    });
    if (!stored) throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    }
    if (stored.expiresAt <= new Date() || !stored.user.isActive || !stored.user.business.isActive) {
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    }

    const session = await this.issueSession(stored.user, meta);
    const next = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(session.refreshToken) },
      select: { id: true },
    });
    // Revocación condicional: si otra petición ya lo rotó, esta no gana.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: next.id },
    });
    if (count === 0) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    }
    return session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professional: { select: { id: true } } },
    });
    if (!user || !user.isActive)
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    return this.toSessionUser(user);
  }

  private async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    user: Parameters<AuthService['toSessionUser']>[0],
    meta: SessionMeta,
  ): Promise<Session> {
    const sessionUser = this.toSessionUser(user);
    const payload: AuthUser = {
      sub: user.id,
      bid: user.businessId,
      role: user.role,
      ...(sessionUser.professionalId ? { pid: sessionUser.professionalId } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });

    return { accessToken, user: sessionUser, refreshToken, refreshExpiresAt };
  }

  private toSessionUser(user: {
    id: string;
    name: string;
    email: string;
    role: AuthUser['role'];
    businessId: string;
    professional: { id: string } | null;
  }): SessionUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      professionalId: user.professional?.id ?? null,
    };
  }
}
