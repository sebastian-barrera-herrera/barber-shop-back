import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/validation';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Barbería' })
  @Trim()
  @IsString()
  @Length(2, 60, { message: 'El nombre debe tener entre 2 y 60 caracteres' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
