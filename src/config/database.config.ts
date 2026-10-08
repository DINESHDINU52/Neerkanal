import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ENTITIES } from '../database/entities';
import { ENV } from '../common/utils';

export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  const isPostgres = !!ENV('DATABASE_URL');
  const baseConfig = isPostgres
    ? {
        type: 'postgres' as const,
        url: ENV('DATABASE_URL'),
        ssl:
          ENV('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        type: 'better-sqlite3' as const,
        database: ENV('SQLITE_FILE', 'nerkanal.db'),
      };

  return {
    ...baseConfig,
    entities: ENTITIES,
    synchronize: ENV('DB_SYNC', 'true') === 'true',
  };
};
