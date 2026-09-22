import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusinessStyle, BusinessType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterBusinessDto {
  @ApiProperty({ example: 'Barbería El Bigote' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Escribe el nombre del negocio' })
  @MaxLength(80)
  businessName!: string;

  @ApiProperty({ example: 'barberia-el-bigote', description: 'Dirección: filo.com/<slug>' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9-]{3,40}$/, {
    message: 'La dirección usa entre 3 y 40 letras minúsculas, números o guiones',
  })
  slug!: string;

  @ApiProperty({ enum: BusinessStyle, description: 'Barbería o spa: define el diseño de todo' })
  @IsEnum(BusinessStyle, { message: 'Elige barbería o spa' })
  style!: BusinessStyle;

  @ApiPropertyOptional({ enum: BusinessType })
  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType;

  @ApiProperty({ example: 'Andrés Gómez' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Escribe tu nombre' })
  @MaxLength(80)
  ownerName!: string;

  @ApiProperty({ example: 'andres@elbigote.co' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Escribe un correo válido' })
  email!: string;

  @ApiProperty({ example: '••••••••' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Medellín' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;
}
