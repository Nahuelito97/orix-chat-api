import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDirectDto {
  @IsString()
  otherId!: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  memberIds!: string[];
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}

export class EditMessageDto {
  @IsString()
  @MaxLength(4000)
  text!: string;
}

export class ReactionDto {
  @IsString()
  @MaxLength(8)
  emoji!: string;
}
