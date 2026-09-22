import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../../common/pagination';
import { Trim } from '../../../common/validation';
import { CustomerContactDto } from '../../customers/dto/customer.dto';

/** Reserva desde la web pública. */
export class PublicCreateAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Vacío = "me da igual" (primero disponible)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  professionalId?: string | null;

  @ApiProperty({
    example: '2026-09-25T21:00:00.000Z',
    description: 'Una de las horas devueltas por /availability',
  })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ type: CustomerContactDto })
  @ValidateNested()
  @Type(() => CustomerContactDto)
  customer!: CustomerContactDto;

  @ApiPropertyOptional({ example: 'Primera vez, quiero un fade bajo' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Reserva manual desde el panel. */
export class AdminCreateAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  professionalId!: string;

  @ApiProperty({ example: '2026-09-25T21:00:00.000Z' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Cliente existente…' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ type: CustomerContactDto, description: '…o datos de un cliente nuevo' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerContactDto)
  customer?: CustomerContactDto;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Nota interna, el cliente no la ve' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED'], default: 'CONFIRMED' })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED'])
  status?: 'PENDING' | 'CONFIRMED';

  @ApiPropertyOptional({
    default: false,
    description: 'Permite agendar fuera del horario (nunca encima de otra cita)',
  })
  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;
}

/** Mover o editar una cita. */
export class UpdateAppointmentDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() professionalId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() serviceId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string | null;

  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @ApiPropertyOptional({ enum: ['UNPAID', 'PAID'], description: 'Marcar pago en el local' })
  @IsOptional()
  @IsIn(['UNPAID', 'PAID'])
  paymentStatus?: 'UNPAID' | 'PAID';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus, { message: 'Estado no válido' })
  status!: AppointmentStatus;

  @ApiPropertyOptional({ example: 'El cliente avisó que no puede venir' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CancelByTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListAppointmentsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Desde (ISO)' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ description: 'Hasta (ISO)' }) @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() professionalId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() serviceId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;

  @ApiPropertyOptional({
    enum: AppointmentStatus,
    isArray: true,
    description: 'Uno o varios, separados por coma',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(AppointmentStatus, { each: true })
  status?: AppointmentStatus[];

  @ApiPropertyOptional({ description: 'Cliente, teléfono o servicio' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  q?: string;
}
