import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const appointment = {
    id: 'a1',
    businessId: 'b1',
    startsAt: new Date('2026-09-23T11:55:00Z'),
    serviceNameSnapshot: 'Corte',
    durationMinutes: 30,
    priceCents: 3_500_000,
    status: 'CONFIRMED',
    customer: { name: 'Juan', phone: '+573001234567', email: null },
    business: { name: 'Studio', timezone: 'America/Bogota' },
    professional: { name: 'Carlos' },
  };

  function setup(delivered: number) {
    const prisma = {
      appointment: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            'reminder24hSentAt' in where ? Promise.resolve([appointment]) : Promise.resolve([]),
          ),
        update: jest.fn(),
      },
    };
    const notifications = {
      notify: jest.fn().mockResolvedValue(delivered),
      hasCustomerChannel: () => true,
    };
    const config = { get: () => true };
    return {
      prisma,
      notifications,
      service: new RemindersService(prisma as never, notifications as never, config as never),
    };
  }

  it('envía "tu cita es mañana" dentro de la ventana de 24 h y lo marca como enviado', async () => {
    const { prisma, notifications, service } = setup(1);
    await expect(service.run(now)).resolves.toBe(1);

    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.startsAt.lte.toISOString()).toBe('2026-09-23T12:00:00.000Z');
    expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'CUSTOMER',
        title: expect.stringContaining('es mañana a las 6:55'),
      }),
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { reminder24hSentAt: expect.any(Date) },
    });
  });

  it('si ningún canal lo entregó, no lo marca (se reintenta en la siguiente vuelta)', async () => {
    const { prisma, service } = setup(0);
    await expect(service.run(now)).resolves.toBe(0);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});
