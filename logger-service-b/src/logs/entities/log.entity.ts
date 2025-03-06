import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type LogDocument = Log & Document;

@Schema({
  timestamps: true,
  collection: 'logs',
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Log {
  @ApiProperty({ description: 'Timestamp when the event occurred' })
  @Prop({ required: true, type: Date, index: true })
  timestamp: Date;

  @ApiProperty({ description: 'Type of event (request, response, error, etc.)' })
  @Prop({ required: true, index: true })
  eventType: string;

  @ApiProperty({ description: 'Service identifier' })
  @Prop({ required: true, index: true })
  serviceId: string;

  @ApiProperty({ description: 'API endpoint path' })
  @Prop({ required: true, index: true })
  endpoint: string;

  @ApiProperty({ description: 'HTTP method' })
  @Prop()
  method: string;

  @ApiProperty({ description: 'Status code (for responses)' })
  @Prop({ index: true })
  statusCode?: number;

  @ApiProperty({ description: 'Execution time in milliseconds' })
  @Prop({ index: true })
  executionTime?: number;

  @ApiProperty({ description: 'Correlation ID for request tracing' })
  @Prop({ index: true })
  correlationId?: string;

  @ApiProperty({ description: 'Request headers' })
  @Prop({ type: Object })
  headers?: Record<string, any>;

  @ApiProperty({ description: 'Request body' })
  @Prop({ type: Object })
  requestBody?: Record<string, any>;

  @ApiProperty({ description: 'Response body' })
  @Prop({ type: Object })
  responseBody?: Record<string, any>;

  @ApiProperty({ description: 'Error details' })
  @Prop({ type: Object })
  error?: Record<string, any>;

  @ApiProperty({ description: 'Additional metadata' })
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const LogSchema = SchemaFactory.createForClass(Log);

// Create indexes for efficient querying
LogSchema.index({ timestamp: 1 });
LogSchema.index({ eventType: 1, timestamp: 1 });
LogSchema.index({ serviceId: 1, timestamp: 1 });
LogSchema.index({ endpoint: 1, timestamp: 1 });
LogSchema.index({ statusCode: 1, timestamp: 1 });
LogSchema.index({ correlationId: 1 });

// TTL index for automatic cleanup (e.g., delete logs older than 30 days)
LogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });