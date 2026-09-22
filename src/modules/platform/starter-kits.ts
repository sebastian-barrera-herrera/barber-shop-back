import type { BusinessStyle, BusinessType } from '@prisma/client';

/**
 * Lo que trae una empresa recién registrada para no empezar en blanco:
 * paleta, textos de portada y una carta de servicios de ejemplo que el dueño edita o borra.
 */
export interface StarterKit {
  preset: string;
  heroTitle: string;
  heroSubtitle: string;
  ownerTitle: string;
  categories: { name: string; services: [string, string, number, number][] }[];
}

const BARBER: StarterKit = {
  preset: 'clasico',
  heroTitle: 'El buen corte no pasa de moda.',
  heroSubtitle: 'Reserva tu silla en un minuto. Sin llamadas, sin esperas.',
  ownerTitle: 'Barbero',
  categories: [
    {
      name: 'Cortes',
      services: [
        ['Corte clásico', 'Tijera y máquina, lavado y peinado.', 35_000, 45],
        ['Fade', 'Degradado a máquina con acabado a navaja.', 40_000, 45],
        ['Corte infantil', 'Para niños hasta 12 años.', 28_000, 30],
      ],
    },
    {
      name: 'Barba',
      services: [
        ['Corte + barba', 'Corte completo y perfilado de barba.', 50_000, 60],
        ['Arreglo de barba', 'Perfilado y rebajado con acabado a navaja.', 25_000, 30],
        ['Afeitado con toalla caliente', 'Afeitado clásico a navaja.', 30_000, 30],
      ],
    },
  ],
};

const SPA: StarterKit = {
  preset: 'spa',
  heroTitle: 'Un rato para ti.',
  heroSubtitle: 'Reserva tu cita en un minuto y llega a desconectarte.',
  ownerTitle: 'Especialista',
  categories: [
    {
      name: 'Rostro y cuerpo',
      services: [
        ['Limpieza facial', 'Limpieza profunda, extracción e hidratación.', 80_000, 60],
        ['Masaje relajante', 'Cuerpo completo con aceites tibios.', 110_000, 60],
      ],
    },
    {
      name: 'Manos y pies',
      services: [
        ['Manicure', 'Limado, cutícula y esmaltado.', 25_000, 45],
        ['Pedicure spa', 'Exfoliación, masaje y esmaltado.', 40_000, 60],
        ['Semipermanente', 'Esmaltado en gel que dura hasta 3 semanas.', 45_000, 60],
      ],
    },
  ],
};

export function starterKit(style: BusinessStyle): StarterKit {
  return style === 'BARBER' ? BARBER : SPA;
}

/** Tipo de negocio por defecto para cada estilo (el dueño lo puede afinar después). */
export function defaultType(style: BusinessStyle): BusinessType {
  return style === 'BARBER' ? 'BARBERSHOP' : 'SPA';
}
