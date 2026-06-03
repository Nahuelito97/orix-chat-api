import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TranslateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @IsString()
  @MaxLength(40)
  to!: string; // idioma destino: "es", "en", "español", "inglés"…
}

export class AssistDto {
  @IsOptional()
  @IsString()
  lang?: string;
}
