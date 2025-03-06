import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisTimeSeriesService } from './redis-timeseries.service';

@Module({
  imports: [ConfigModule],
  providers: [RedisTimeSeriesService],
  exports: [RedisTimeSeriesService],
})
export class StorageModule {} 