import { IsEmail, MinLength, IsString, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  dob?: string;

  @IsOptional()
  zodiac?: string;

  @IsOptional()
  phone?: string;
}

export class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}
