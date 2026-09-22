import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PageQuery } from '../../../common/pagination';
import { Trim } from '../../../common/validation';

export class CustomerContactDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'Escribe tu nombre (mínimo 2 letras)' })
  name!: string;

  @ApiProperty({ example: '300 123 4567', description: 'Se normaliza a formato internacional' })
  @Trim()
  @IsString()
  @Length(7, 25, { message: 'Escribe un teléfono válido' })
  phone!: string;

  @ApiPropertyOptional({ example: 'juan@correo.com' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsEmail({}, { message: 'Escribe un correo válido' })
  email?: string;
}

export class CreateCustomerDto extends CustomerContactDto {
  @ApiPropertyOptional({ example: 'Prefiere corte con tijera' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class ListCustomersQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Nombre, teléfono o correo' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  q?: string;
}
