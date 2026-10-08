import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { ENV, sha, rid } from '../../../common/utils';
import { BASE_URL } from './notifier.service';

/* Video-intro AI. Plug a real provider via VIDEO_AI_URL (must return {faceDetected, communication, confidence, passion} 0-100).
   Without it, a clearly-flagged DEMO scorer runs so the flow is testable. */
@Injectable()
export class VideoAI {
  async analyze(file: string, size: number) {
    if (ENV('VIDEO_AI_URL')) {
      const r: any = await fetch(ENV('VIDEO_AI_URL'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ENV('VIDEO_AI_KEY')}`,
        },
        body: JSON.stringify({
          url: `${BASE_URL()}/files/${path.basename(file)}`,
        }),
      }).then((x) => x.json());
      const overall = Math.round(
        (r.communication + r.confidence + r.passion) / 3,
      );
      return {
        faceVerified: !!r.faceDetected,
        communication: r.communication,
        confidence: r.confidence,
        passion: r.passion,
        overall,
        demo: false,
      };
    }
    const h = parseInt(sha(file + size).slice(0, 6), 16),
      s = (k: number) => 55 + ((h >> k) % 40);
    const c = s(1),
      f = s(5),
      p = s(9);
    return {
      faceVerified: size > 1000,
      communication: c,
      confidence: f,
      passion: p,
      overall: Math.round((c + f + p) / 3),
      demo: true,
    };
  }
}

export const upload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_r, _f, cb) => {
      fs.mkdirSync('uploads', { recursive: true });
      cb(null, 'uploads');
    },
    filename: (_r, f, cb) =>
      cb(null, rid(12) + path.extname(f.originalname)),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/** Thin Claude/LLM helper (Messages API). Used by mock interviews and Jarvis. Returns null when no key is configured. */
export async function llm(
  system: string,
  user: string,
  max = 800,
): Promise<string | null> {
  if (!ENV('ANTHROPIC_API_KEY')) return null;
  const r: any = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ENV('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ENV('JARVIS_MODEL', 'claude-sonnet-5-5'),
      max_tokens: max,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  }).then((x) => x.json());
  return (
    (r.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n') || null
  );
}
