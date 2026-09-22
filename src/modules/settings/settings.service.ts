import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bookingSchema,
  brandingSchema,
  openingHoursSchema,
  parseSettings,
  socialSchema,
} from '../business/settings.schema';

const url = z.string().trim().url('URL inválida').max(300).or(z.literal('')).optional();

/** Esquemas de actualización: parciales, se combinan con lo guardado y se valida el resultado. */
export const SECTION_SCHEMAS = {
  branding: brandingSchema.partial().strict(),
  social: z
    .object({
      instagram: url,
      facebook: url,
      tiktok: url,
      website: url,
      whatsapp: z.string().trim().max(30).optional(),
    })
    .strict(),
  openingHours: openingHoursSchema
    .refine(
      (days) => new Set(days.map((d) => d.weekday)).size === 7,
      'Debe incluir los 7 días una vez',
    )
    .refine(
      (days) => days.every((d) => d.closed || d.open < d.close),
      'La hora de cierre debe ser posterior a la de apertura',
    ),
  booking: bookingSchema.partial().strict(),
} as const;

export type Section = keyof typeof SECTION_SCHEMAS;

const FULL: Record<Section, z.ZodTypeAny> = {
  branding: brandingSchema,
  social: socialSchema,
  openingHours: openingHoursSchema,
  booking: bookingSchema,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(businessId: string) {
    const row = await this.prisma.businessSettings.findUnique({ where: { businessId } });
    return parseSettings(row);
  }

  async update(businessId: string, section: Section, patch: unknown) {
    const current = await this.get(businessId);
    const merged =
      section === 'openingHours'
        ? patch
        : section === 'social'
          ? Object.fromEntries(
              Object.entries({ ...current.social, ...(patch as object) }).filter(
                ([, v]) => v !== '',
              ),
            )
          : { ...current[section], ...(patch as object) };
    const parsed = FULL[section].safeParse(merged);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);

    const value = parsed.data as Prisma.InputJsonValue;
    await this.prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId, [section]: value },
      update: { [section]: value },
    });
    return this.get(businessId);
  }
}
