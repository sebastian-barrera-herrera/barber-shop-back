import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ToBoolean, Trim } from '../../../common/validation';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte clásico' })
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres' })
  name!: string;

  @ApiPropertyOptional({ example: 'Corte a tijera y máquina con acabado a navaja.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = sin categoría' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ example: 3_500_000, description: 'Precio en centavos. $35.000 COP = 3500000' })
  @IsInt({ message: 'El precio debe ser un número entero en centavos' })
  @Min(0)
  @Max(10_000_000_000)
  priceCents!: number;

  @ApiProperty({ example: 45, description: 'Duración en minutos (múltiplo de 5)' })
  @IsInt()
  @Min(5, { message: 'La duración mínima es 5 minutos' })
  @Max(720)
  durationMinutes!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  imageUrl?: string | null;

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
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class ListServicesQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Buscar por nombre' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ default: true, description: 'Incluir servicios pausados' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
