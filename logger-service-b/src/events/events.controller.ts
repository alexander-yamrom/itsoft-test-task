import { Controller, Get, Post, Body, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { EventsHealthService } from './events-health.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly healthService: EventsHealthService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get event system health status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the health status of the event system',
  })
  async getHealth() {
    return await this.healthService.getStatus();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get event statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns statistics about stored events',
  })
  async getStats() {
    return this.eventsService.getEventStats();
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Clean up old events' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cleans up old events based on retention policy',
  })
  async cleanupOldEvents(@Body() body: { days: number }) {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - (body.days || 30));
    
    const deletedCount = await this.eventsService.cleanupOldEvents(olderThan);
    
    return {
      success: true,
      deletedCount,
      olderThan,
    };
  }
}