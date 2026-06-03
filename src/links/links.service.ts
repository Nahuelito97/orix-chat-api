import { BadRequestException, Injectable } from '@nestjs/common';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

@Injectable()
export class LinksService {
  private readonly cache = new Map<string, LinkPreview>();

  private meta(html: string, prop: string): string | undefined {
    const a = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    const b = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
      'i',
    );
    return html.match(a)?.[1] ?? html.match(b)?.[1];
  }

  async preview(url: string): Promise<LinkPreview> {
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException('URL inválida');
    }
    const cached = this.cache.get(url);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let result: LinkPreview = { url };
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OrixChatBot/1.0 (link-preview)' },
      });
      const html = (await res.text()).slice(0, 300_000);
      const title =
        this.meta(html, 'og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1];
      result = {
        url,
        title: title?.trim(),
        description: this.meta(html, 'og:description')?.trim(),
        image: this.meta(html, 'og:image')?.trim(),
      };
    } catch {
      /* sin preview disponible */
    } finally {
      clearTimeout(timer);
    }

    this.cache.set(url, result);
    return result;
  }
}
