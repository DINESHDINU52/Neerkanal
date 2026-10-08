import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../../../database/database.service';
import { ENV } from '../../../common/utils';

const log = new Logger('ExternalJobs');

@Injectable()
export class ExternalJobs {
  private cache = new Map<string, { at: number; rows: any[] }>();

  constructor(private db: Db) {}

  async search(q: string) {
    const key = (q || '').toLowerCase().trim(),
      hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60e3) return hit.rows;
    const rows: any[] = [];
    try {
      const r = await fetch(
        `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q || '')}&limit=20`,
      ).then((x) => x.json());
      for (const j of r.jobs || []) {
        rows.push({
          externalId: 'remotive-' + j.id,
          title: j.title,
          companyName: j.company_name,
          location: j.candidate_required_location,
          applyUrl: j.url,
          description: (j.description || '')
            .replace(/<[^>]+>/g, ' ')
            .slice(0, 1500),
          skills: j.tags || [],
          via: 'Remotive',
        });
      }
    } catch (e: any) {
      log.warn('remotive: ' + e.message);
    }
    if (ENV('RAPIDAPI_KEY')) {
      try {
        const r = await fetch(
          `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q || 'jobs')}&num_pages=1`,
          {
            headers: {
              'X-RapidAPI-Key': ENV('RAPIDAPI_KEY'),
              'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
          },
        ).then((x) => x.json());
        for (const j of r.data || []) {
          rows.push({
            externalId: 'jsearch-' + j.job_id,
            title: j.job_title,
            companyName: j.employer_name,
            location: [j.job_city, j.job_country].filter(Boolean).join(', '),
            applyUrl: j.job_apply_link,
            description: (j.job_description || '').slice(0, 1500),
            skills: j.job_required_skills || [],
            via: j.job_publisher,
          });
        }
      } catch (e: any) {
        log.warn('jsearch: ' + e.message);
      }
    }
    for (const x of rows) {
      const ex = await this.db.jobs.findOneBy({ externalId: x.externalId });
      if (!ex) {
        await this.db.jobs.save(
          this.db.jobs.create({ ...x, source: 'EXTERNAL', status: 'OPEN' }),
        );
      }
    }
    this.cache.set(key, { at: Date.now(), rows });
    return rows;
  }
}
