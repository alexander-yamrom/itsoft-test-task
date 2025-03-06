import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataProcessingController } from './data-processing.controller';
import { DataProcessingService } from './data-processing.service';
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
  controllers: [DataProcessingController],
  providers: [DataProcessingService],
  exports: [DataProcessingService],
})
export class DataProcessingModule {} 