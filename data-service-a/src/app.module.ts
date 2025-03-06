import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { WinstonModule } from 'nest-winston';
import { configureWinston } from './config/winston.config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataAcquisitionModule } from './modules/data-acquisition/data-acquisition.module';
import { DataProcessingModule } from './modules/data-processing/data-processing.module';
import { DataSearchModule } from './modules/data-search/data-search.module';
import { EventPublishingModule } from './modules/event-publishing/event-publishing.module';
import { HealthModule } from './modules/health/health.module';
import { RedisCacheModule } from './modules/redis-cache/redis-cache.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Logging
    WinstonModule.forRoot(configureWinston()),
    
    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        ttl: 60,
        limit: 100,
      }),
    }),
    
    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }),
    }),
    
    // Feature Modules
    DataAcquisitionModule,
    DataProcessingModule,
    DataSearchModule,
    EventPublishingModule,
    RedisCacheModule,
    HealthModule,
  ],
})
export class AppModule {} 