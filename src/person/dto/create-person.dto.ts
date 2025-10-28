import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreatePersonDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
