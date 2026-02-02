import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsNotEmpty()
  name: string;
}
