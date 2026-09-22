import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ToBoolean, Trim } from '../../../common/validation';

export class ProfessionalSocialDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(200) instagram?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(200) tiktok?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(200) facebook?: string;
}

export class CreateProfessionalDto {
  @ApiProperty({ example: 'Carlos' })
  @Trim()
  @IsString()
  @Length(2, 60, { message: 'El nombre debe tener entre 2 y 60 caracteres' })
  name!: string;

  @ApiPropertyOptional({ example: 'Barbero' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  photoUrl?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['Fade', 'Barba'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean)
      : value,
  )
  specialties?: string[];

  @ApiPropertyOptional({ type: ProfessionalSocialDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfessionalSocialDto)
  social?: ProfessionalSocialDto;

  @ApiPropertyOptional({ example: '#3B4A5A', description: 'Color en el calendario' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({ type: [String], description: 'Servicios que realiza' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

export class UpdateProfessionalDto extends PartialType(
  OmitType(CreateProfessionalDto, ['serviceIds']),
) {}

export class SetServicesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  serviceIds!: string[];
}

/** Invitación al panel: el profesional recibe un correo y elige su propia contraseña. */
export class InviteProfessionalDto {
  @ApiProperty({ example: 'carlos@studio.local' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Escribe un correo válido' })
  email!: string;

  @ApiPropertyOptional({
    description: 'Qué podrá ver en el panel',
    example: { agenda: 'own', clients: false, messages: false, reports: false },
  })
  @IsOptional()
  @IsObject()
  access?: Record<string, unknown>;
}

/** Cambiar lo que ve un profesional dentro del panel. */
export class UpdateAccessDto {
  @ApiProperty({ example: { agenda: 'own', clients: true, messages: true, reports: false } })
  @IsObject()
  access!: Record<string, unknown>;
}

export class ListProfessionalsQuery {
  @ApiPropertyOptional({ format: 'uuid', description: 'Solo quienes realizan este servicio' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
