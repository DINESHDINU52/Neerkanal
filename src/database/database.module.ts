import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';
import { Db } from './database.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [Db],
  exports: [TypeOrmModule, Db],
})
export class DatabaseModule {}
