import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataSearchController } from './data-search.controller';
import { DataSearchService } from './data-search.service';
import { City, CitySchema } from '../../entities/city.schema';
import { EventPublishingModule } from '../event-publishing/event-publishing.module';
import { RedisCacheModule } from '../redis-cache/redis-cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: City.name, schema: CitySchema },
    ]),
    EventPublishingModule,
    RedisCacheModule,
  ],
  controllers: [DataSearchController],
  providers: [DataSearchService],
  exports: [DataSearchService],
})
export class DataSearchModule {} 