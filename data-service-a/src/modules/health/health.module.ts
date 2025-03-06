import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HttpModule } from "@nestjs/axios";
import { HealthController } from "./health.controller";
import { RedisCacheModule } from "../redis-cache/redis-cache.module";

@Module({
  imports: [TerminusModule, HttpModule, RedisCacheModule],
  controllers: [HealthController],
})
export class HealthModule {}
