import { Injectable } from '@nestjs/common';
import { Document, WithId } from 'mongodb';
import { RedisTimeSeriesService } from '../storage/redis-timeseries.service';
import * as PDFDocument from 'pdfkit';

interface EventDocument extends Document {
  timestamp: number;
  type: string;
  data: any;
}

@Injectable()
export class ReportService {
  constructor(private readonly redisTimeSeriesService: RedisTimeSeriesService) {}

  async getTimeSeriesData(key: string, startTime?: number, endTime?: number) {
    const date = new Date(startTime ? startTime * 1000 : Date.now()).toISOString().split('T')[0];
    return this.redisTimeSeriesService.getLogsByDay(date);
  }

  async getTimeSeriesDataByFilter(filter: string, startTime?: number, endTime?: number) {
    return this.redisTimeSeriesService.getLogsByType(filter);
  }

  async generatePdfReport(
    startTime: number | undefined,
    endTime: number | undefined,
    filter?: string,
    reportType: string = 'default',
  ): Promise<Buffer> {
    const start = startTime || Math.floor(Date.now() / 1000) - 86400;
    const end = endTime || Math.floor(Date.now() / 1000);
    
    let timeSeriesData;
    try {
      if (filter) {
        timeSeriesData = await this.getTimeSeriesDataByFilter(filter, start, end);
      } else {
        const startDate = new Date(start * 1000).toISOString().split('T')[0];
        const endDate = new Date(end * 1000).toISOString().split('T')[0];
        timeSeriesData = await this.redisTimeSeriesService.getLogsByDateRange(startDate, endDate);
      }
    } catch (error) {
      console.error('Error fetching time series data:', error);
      timeSeriesData = [];
    }

    const eventLogs: WithId<EventDocument>[] = [];

    return this.createPdf(timeSeriesData, eventLogs, reportType);
  }

  private async createPdf(timeSeriesData: any, eventLogs: WithId<EventDocument>[], reportType: string): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(25).text('Time Series Report', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Report generated on: ${new Date().toISOString()}`, { align: 'center' });
      doc.fontSize(12).text(`Report type: ${reportType}`, { align: 'center' });
      doc.moveDown();

      doc.fontSize(16).text('Log Data', { underline: true });
      doc.moveDown();

      if (timeSeriesData && Array.isArray(timeSeriesData) && timeSeriesData.length > 0) {
        doc.fontSize(12).text(`Total logs: ${timeSeriesData.length}`);
        doc.moveDown();

        const sampleLogs = timeSeriesData.slice(0, 5);
        doc.fontSize(10).text(`Sample logs (first 5 of ${timeSeriesData.length}):`);
        doc.moveDown(0.5);

        sampleLogs.forEach((log, index) => {
          doc.fontSize(9).font('Helvetica-Bold').text(`Log ${index + 1}:`);
          doc.font('Helvetica');
          
          if (log.timestamp) {
            const date = new Date(log.timestamp);
            doc.text(`Timestamp: ${date.toISOString()}`);
          }
          
          if (log.level) {
            doc.text(`Level: ${log.level}`);
          }
          
          if (log.message) {
            doc.text(`Message: ${log.message}`);
          }
          
          if (log.service) {
            doc.text(`Service: ${log.service}`);
          }
          
          doc.moveDown();
        });
        
        if (timeSeriesData.some(log => log.level)) {
          const logsByLevel = timeSeriesData.reduce((acc, log) => {
            const level = log.level || 'unknown';
            acc[level] = (acc[level] || 0) + 1;
            return acc;
          }, {});
          
          doc.moveDown();
          doc.fontSize(10).font('Helvetica-Bold').text('Log Level Statistics:');
          doc.font('Helvetica');
          
          Object.entries(logsByLevel).forEach(([level, count]) => {
            const percentage = ((count as number) / timeSeriesData.length * 100).toFixed(1);
            doc.text(`${level}: ${count} (${percentage}%)`);
          });
        }
      } else {
        doc.fontSize(12).text('No log data available for the specified period.');
      }

      doc.end();
    });
  }
} 