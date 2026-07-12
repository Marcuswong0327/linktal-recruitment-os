import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: "Azure AD id_token from the web app's OAuth sign-in" })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
