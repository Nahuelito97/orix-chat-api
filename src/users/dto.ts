import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  username?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
