import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportService } from './report.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';

class GeneratePdfReportDto {
  startTime?: number;
  endTime?: number;
  filter?: string;
  reportType?: string;
}

@ApiTags('reports')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('generate-pdf')
  @ApiOperation({ summary: 'Generate a PDF report based on log data' })
  @ApiResponse({ status: 200, description: 'PDF report generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiBody({ type: GeneratePdfReportDto })
  async generatePdfReport(
    @Body() reportParams: GeneratePdfReportDto,
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.reportService.generatePdfReport(
        reportParams.startTime,
        reportParams.endTime,
        reportParams.filter,
        reportParams.reportType,
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=report-${Date.now()}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error) {
      console.error('Error generating PDF report:', error);
      res.status(500).json({ 
        error: 'Failed to generate PDF report',
        message: error.message 
      });
    }
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Get time series data by date range' })
  @ApiQuery({ name: 'key', required: true, type: String })
  @ApiQuery({ name: 'startTime', required: false, type: Number })
  @ApiQuery({ name: 'endTime', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Time series data retrieved successfully' })
  async getTimeSeriesData(
    @Query('key') key: string,
    @Query('startTime') startTime?: number,
    @Query('endTime') endTime?: number,
  ) {
    try {
      const start = startTime ? Number(startTime) : undefined;
      const end = endTime ? Number(endTime) : undefined;
      
      return await this.reportService.getTimeSeriesData(key, start, end);
    } catch (error) {
      throw new Error(`Failed to fetch time series data: ${error.message}`);
    }
  }

  @Get('timeseries/filter')
  @ApiOperation({ summary: 'Get time series data by filter' })
  @ApiQuery({ name: 'filter', required: true, type: String })
  @ApiQuery({ name: 'startTime', required: false, type: Number })
  @ApiQuery({ name: 'endTime', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Filtered time series data retrieved successfully' })
  async getTimeSeriesDataByFilter(
    @Query('filter') filter: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    try {
      const start = startTime ? Number(startTime) : undefined;
      const end = endTime ? Number(endTime) : undefined;
      
      return await this.reportService.getTimeSeriesDataByFilter(filter, start, end);
    } catch (error) {
      throw new Error(`Failed to fetch filtered time series data: ${error.message}`);
    }
  }
} 