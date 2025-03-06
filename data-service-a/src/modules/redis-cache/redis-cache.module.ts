import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { TimeSeriesService } from './time-series.service';

@Module({
  imports: [ConfigModule],
  providers: [RedisService, TimeSeriesService],
  exports: [RedisService, TimeSeriesService],
})
export class RedisCacheModule {} 