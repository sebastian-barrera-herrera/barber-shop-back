import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { parseSettings } from './settings.schema';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resuelve el negocio de una ruta pública. Negocios inactivos no existen para el público. */
  async resolveSlug(slug: string): Promise<string> {
    const business = await this.prisma.business.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Este negocio no existe');
    return business.id;
  }

  /** Perfil público: lo que necesita la landing (marca, contacto, horario, redes). */
  async getPublicProfile(slug: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, isActive: true },
      include: { settings: true },
    });
    if (!business) throw new NotFoundException('Este negocio no existe');
    const settings = parseSettings(business.settings);
    return {
      slug: business.slug,
      name: business.name,
      type: business.type,
      description: business.description,
      phone: business.phone,
      email: business.email,
      whatsapp: business.whatsapp,
      address: business.address,
      city: business.city,
      country: business.country,
      latitude: business.latitude?.toNumber() ?? null,
      longitude: business.longitude?.toNumber() ?? null,
      timezone: business.timezone,
      currency: business.currency,
      locale: business.locale,
      logoUrl: business.logoUrl,
      heroImageUrl: business.heroImageUrl,
      branding: settings.branding,
      social: settings.social,
      openingHours: settings.openingHours,
      booking: {
        slotStepMinutes: settings.booking.slotStepMinutes,
        minAdvanceMinutes: settings.booking.minAdvanceMinutes,
        maxAdvanceDays: settings.booking.maxAdvanceDays,
        cancellationWindowHours: settings.booking.cancellationWindowHours,
        paymentMode: settings.booking.paymentMode,
      },
    };
  }

  /** Lo que necesitan la agenda y las reservas: zona horaria, país (teléfonos) y reglas. */
  async getSchedulingContext(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        timezone: true,
        country: true,
        currency: true,
        address: true,
        city: true,
        phone: true,
        whatsapp: true,
        settings: true,
      },
    });
    const { settings, ...rest } = business;
    return { ...rest, settings: parseSettings(settings) };
  }

  async get(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { settings: true },
    });
    const { settings, latitude, longitude, ...rest } = business;
    return {
      ...rest,
      latitude: latitude?.toNumber() ?? null,
      longitude: longitude?.toNumber() ?? null,
      settings: parseSettings(settings),
    };
  }

  async update(businessId: string, dto: UpdateBusinessDto) {
    await this.prisma.business.update({ where: { id: businessId }, data: dto });
    return this.get(businessId);
  }
}
