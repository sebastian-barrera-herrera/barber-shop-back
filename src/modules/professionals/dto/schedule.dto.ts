import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/validation';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export class TimeRangeDto {
  @ApiProperty({ example: '09:00' })
  @Matches(HHMM, { message: 'Usa el formato HH:mm' })
  start!: string;

  @ApiProperty({ example: '13:00' })
  @Matches(HHMM, { message: 'Usa el formato HH:mm' })
  end!: string;
}

export class WorkingDayDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = domingo … 6 = sábado' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ type: [TimeRangeDto], description: 'Vacío = día de descanso' })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  ranges!: TimeRangeDto[];
}

/** Reemplaza el horario semanal completo. Los días que no vengan quedan como descanso. */
export class SetWorkingHoursDto {
  @ApiProperty({ type: [WorkingDayDto] })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  days!: WorkingDayDto[];
}

export class CreateTimeOffDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'null = todo el negocio (cierre)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  professionalId?: string | null;

  @ApiProperty({ example: '2026-09-30T15:00:00.000Z' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: '2026-09-30T17:00:00.000Z' })
  @IsISO8601({ strict: true })
  endsAt!: string;

  @ApiPropertyOptional({ example: 'Cita médica' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListTimeOffQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}
