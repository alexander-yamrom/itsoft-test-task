import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { DataAcquisitionController } from './data-acquisition.controller';
import { DataAcquisitionService } from './data-acquisition.service';
import { GeoDBService } from './geodb.service';
import { City, CitySchema } from '../../entities/city.schema';
import { EventPublishingModule } from '../event-publishing/event-publishing.module';
import { RedisCacheModule } from '../redis-cache/redis-cache.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    MongooseModule.forFeature([
      { name: City.name, schema: CitySchema },
    ]),
    EventPublishingModule,
    RedisCacheModule,
  ],
  controllers: [DataAcquisitionController],
  providers: [DataAcquisitionService, GeoDBService],
  exports: [DataAcquisitionService, GeoDBService],
})
export class DataAcquisitionModule {} 