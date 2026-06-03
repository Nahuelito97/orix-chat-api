import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Deriva un username libre a partir del email (sufijo si choca). */
  private async uniqueUsername(base: string): Promise<string> {
    const clean =
      base
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '') || 'user';
    let candidate = clean;
    let n = 0;
    while (
      await this.prisma.user.findUnique({ where: { username: candidate } })
    ) {
      n += 1;
      candidate = `${clean}${n}`;
    }
    return candidate;
  }

  /**
   * Crea o actualiza el usuario a partir del token de Firebase.
   * Se llama justo después del login en el front.
   */
  async sync(auth: AuthUser, desiredUsername?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: auth.uid },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: auth.uid },
        data: { lastSeen: new Date() },
      });
    }

    let username = desiredUsername?.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (
      !username ||
      (await this.prisma.user.findUnique({ where: { username } }))
    ) {
      username = await this.uniqueUsername(username || auth.email || auth.uid);
    }

    return this.prisma.user.create({
      data: {
        id: auth.uid,
        username,
        name: auth.name,
        email: auth.email,
        avatar: auth.picture,
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Busca usuarios por coincidencia parcial de username (excluye al propio). */
  search(query: string, selfId: string) {
    const q = query.trim().toLowerCase().replace('@', '');
    if (!q) return [];
    return this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        NOT: { id: selfId },
      },
      take: 20,
      orderBy: { username: 'asc' },
    });
  }

  updateProfile(
    id: string,
    data: { name?: string; bio?: string; avatar?: string },
  ) {
    return this.prisma.user.update({ where: { id }, data });
  }

  touchLastSeen(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastSeen: new Date() },
    });
  }
}
