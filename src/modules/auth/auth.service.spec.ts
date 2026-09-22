import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

describe('AuthService', () => {
  let prisma: any;
  let service: AuthService;
  let passwordHash: string;

  const baseUser = () => ({
    id: 'u1',
    businessId: 'b1',
    email: 'admin@studio.local',
    name: 'Admin',
    role: 'OWNER' as const,
    isActive: true,
    passwordHash,
    professional: null,
    business: { isActive: true },
  });

  beforeAll(async () => {
    passwordHash = await hashPassword('correcta-123');
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'rt-new' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const jwt = new JwtService({ secret: 'x'.repeat(32), signOptions: { expiresIn: '15m' } });
    const config = {
      get: (k: string) => (k === 'REFRESH_TOKEN_TTL_DAYS' ? 30 : undefined),
    } as AppConfig;
    service = new AuthService(prisma as PrismaService, jwt, config, {
      enabled: false,
      send: jest.fn(),
    });
  });

  it('inicia sesión con credenciales correctas y guarda el refresh hasheado', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const session = await service.login('Admin@Studio.local ', 'correcta-123');

    expect(session.accessToken).toBeTruthy();
    expect(session.user).toMatchObject({ id: 'u1', role: 'OWNER', businessId: 'b1' });
    const saved = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(saved.tokenHash).not.toBe(session.refreshToken);
    expect(saved.tokenHash).toHaveLength(64);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'admin@studio.local' } }),
    );
  });

  it('rechaza contraseña incorrecta con un mensaje genérico', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    await expect(service.login('admin@studio.local', 'otra-clave-1')).rejects.toThrow(
      'Correo o contraseña incorrectos',
    );
  });

  it('rechaza un correo inexistente con el mismo mensaje (no revela qué correos existen)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('nadie@studio.local', 'correcta-123')).rejects.toThrow(
      'Correo o contraseña incorrectos',
    );
  });

  it('rechaza usuarios desactivados o de negocios desactivados', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser(), isActive: false });
    await expect(service.login('admin@studio.local', 'correcta-123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    prisma.user.findUnique.mockResolvedValue({ ...baseUser(), business: { isActive: false } });
    await expect(service.login('admin@studio.local', 'correcta-123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rota el refresh token: revoca el usado y entrega uno nuevo', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-old',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser(),
    });
    const session = await service.refresh('token-viejo');

    expect(session.refreshToken).not.toBe('token-viejo');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-old', revokedAt: null },
      data: expect.objectContaining({ replacedById: 'rt-new' }),
    });
  });

  it('si se reutiliza un refresh ya revocado, cierra todas las sesiones del usuario', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-old',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser(),
    });
    await expect(service.refresh('robado')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rechaza refresh vencido o ausente', async () => {
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: baseUser(),
    });
    await expect(service.refresh('vencido')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
