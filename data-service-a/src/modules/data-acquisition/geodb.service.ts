import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { catchError, map, mergeMap } from "rxjs/operators";
import { AxiosError } from "axios";
import { TimeSeriesService } from "../redis-cache/time-series.service";
import { RedisService } from "../redis-cache/redis.service";
import { timer } from "rxjs";

@Injectable()
export class GeoDBService implements OnModuleInit {
  private readonly logger = new Logger(GeoDBService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiHost: string;
  private readonly rateLimit: number;
  private readonly rateLimitPeriod: number; // seconds
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly timeSeriesService: TimeSeriesService,
    private readonly redisService: RedisService
  ) {
    // Update the default base URL to use the correct RapidAPI endpoint
    const defaultBaseUrl = "https://wft-geo-db.p.rapidapi.com";
    this.baseUrl = this.configService.get<string>("GEODB_API_BASE_URL", defaultBaseUrl);
    this.apiKey = this.configService.get<string>("GEODB_API_KEY");
    this.apiHost = this.configService.get<string>("GEODB_API_HOST");
    
    // Update default rate limit to 1 request per second for BASIC plan
    this.rateLimit = this.configService.get<number>("GEODB_API_RATE_LIMIT", 1);
    this.rateLimitPeriod = this.configService.get<number>(
      "GEODB_API_RATE_LIMIT_PERIOD",
      1
    );
  }

  async onModuleInit() {
    // Validate required environment variables
    this.validateConfig();
    
    // Setup time series for API call metrics
    await this.setupTimeSeriesMetrics();

    // Set up periodic cache cleanup
    this.setupCacheCleanup();
  }

  private validateConfig() {
    if (!this.baseUrl) {
      this.logger.error('GEODB_API_BASE_URL is not configured');
      throw new Error('GEODB_API_BASE_URL is required');
    }
    
    if (!this.apiKey) {
      this.logger.error('GEODB_API_KEY is not configured');
      throw new Error('GEODB_API_KEY is required');
    }
    
    if (this.apiKey === 'your_api_key_here') {
      this.logger.error('GEODB_API_KEY is using the default value from .env.example');
      throw new Error('Please configure a valid GEODB_API_KEY');
    }
    
    this.logger.log(`GeoDBService initialized with base URL: ${this.baseUrl}`);
    this.logger.log(`API Rate Limit: ${this.rateLimit} requests per ${this.rateLimitPeriod} seconds`);
  }

  private async setupTimeSeriesMetrics() {
    try {
      await this.timeSeriesService.createTimeSeries("metrics:geodb:api_calls", {
        service: "data-service-a",
        metric_type: "api_calls",
        api: "geodb",
      });

      await this.timeSeriesService.createTimeSeries(
        "metrics:geodb:api_errors",
        {
          service: "data-service-a",
          metric_type: "api_errors",
          api: "geodb",
        }
      );

      await this.timeSeriesService.createTimeSeries(
        "metrics:geodb:response_time",
        {
          service: "data-service-a",
          metric_type: "response_time",
          api: "geodb",
        }
      );
    } catch (error) {
      this.logger.error(
        `Error setting up time series metrics: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Setup periodic cache cleanup to free memory
   */
  private setupCacheCleanup() {
    const interval =
      this.configService.get<number>("CACHE_CLEANUP_INTERVAL", 3600) * 1000; // Default: 1 hour

    setInterval(async () => {
      try {
        this.logger.log("Starting cache cleanup");
        // Get keys with geodb prefix
        const client = this.redisService.getClient();
        if (client) {
          const keys = await client.keys("geodb:*");

          // Random delay to avoid cleanup of all services at the same time
          const ttl = 24 * 3600; // 24 hours TTL
          const randomOffset = Math.floor(Math.random() * 3600); // Random offset up to 1 hour

          for (const key of keys) {
            const keyTtl = await this.redisService.ttl(key);
            // Only reset TTL for keys that don't have one or have a very long TTL
            if (keyTtl === -1 || keyTtl > 7 * 24 * 3600) {
              await client.expire(key, ttl + randomOffset);
              this.logger.log(`Set TTL for ${key} to ${ttl + randomOffset}s`);
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `Error during cache cleanup: ${error.message}`,
          error.stack
        );
      }
    }, interval);
  }

  /**
   * Apply rate limiting to API requests
   * @returns Promise<void>
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsedTime = (now - this.lastRequestTime) / 1000;

    // Always ensure minimum delay between requests for BASIC plan (at least 1.1 seconds)
    const minimumDelay = 1100; // 1.1 seconds in ms, slightly more than 1 per second to be safe
    
    // If last request was too recent, wait regardless of rate limit
    if (elapsedTime < 1.0) {
      const safetyDelayMs = minimumDelay - (elapsedTime * 1000);
      if (safetyDelayMs > 0) {
        this.logger.log(`Enforcing minimum delay between requests: ${safetyDelayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, safetyDelayMs));
      }
    }

    // Reset counter if period has passed
    if (elapsedTime >= this.rateLimitPeriod) {
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
      return;
    }

    // Check if we've hit the rate limit
    if (this.requestCount >= this.rateLimit) {
      // Calculate optimal wait time with buffer
      const sleepTime =
        Math.ceil((this.rateLimitPeriod - elapsedTime) * 1000) + 200; // Adding 200ms buffer

      this.logger.warn(
        `Rate limit reached. Waiting ${sleepTime / 1000} seconds`
      );

      await new Promise((resolve) => setTimeout(resolve, sleepTime));

      // Reset counter after waiting
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
      return;
    }

    // Increment counter and calculate delay if needed
    this.requestCount++;
    if (this.requestCount === 1) {
      this.lastRequestTime = now;
    } else {
      // Add a small delay between requests for more even distribution
      const idealRequestInterval =
        (this.rateLimitPeriod * 1000) / this.rateLimit;
      const timeSinceLastRequest = now - this.lastRequestTime;
      const requestsToDate = this.requestCount - 1;

      const idealElapsedTime = requestsToDate * idealRequestInterval;
      const actualElapsedTime = timeSinceLastRequest;

      if (actualElapsedTime < idealElapsedTime) {
        const delay = Math.ceil(idealElapsedTime - actualElapsedTime);
        if (delay > 50) {
          // Only if the delay is significant
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Get cities with pagination
   * @param offset - Pagination offset
   * @param limit - Number of results to return
   * @param additionalParams - Additional query parameters
   * @returns Promise<any> - Paginated cities data
   */
  async getCities(
    offset: number = 0,
    limit: number = 10,
    additionalParams: Record<string, any> = {}
  ): Promise<any> {
    // Check cache first
    const cacheKey = `geodb:cities:${offset}:${limit}:${JSON.stringify(
      additionalParams
    )}`;
    const cachedData = await this.redisService.getJson<any>(cacheKey);

    if (cachedData) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      return cachedData;
    }

    await this.applyRateLimit();

    const startTime = Date.now();

    try {
      const params = {
        offset,
        limit,
        ...additionalParams,
      };

      const headers = {
        "X-RapidAPI-Key": this.apiKey,
        "X-RapidAPI-Host": this.apiHost,
      };

      const url = `${this.baseUrl}/v1/geo/cities`;

      const response = await firstValueFrom(
        this.httpService.get(url, { params, headers }).pipe(
          map((response) => response.data),
          catchError((error: AxiosError) => {
            const errorDetails = {
              message: error.message,
              response: error.response?.data,
              status: error.response?.status,
              url: url,
              params: params
            };
            
            // Check if this is a rate limit error
            const isRateLimitError = 
              error.response?.status === 429 || 
              (error.response?.data && 
               typeof error.response?.data === 'object' && 
               'message' in error.response?.data && 
               typeof error.response.data.message === 'string' && 
               error.response.data.message.includes('exceeded the rate limit'));
            
            if (isRateLimitError) {
              // Reset request count and force a longer delay
              this.requestCount = this.rateLimit;
              const retryAfter = error.response?.headers?.['retry-after'] ? 
                parseInt(error.response.headers['retry-after'], 10) * 1000 : 2000;
              
              this.logger.warn(
                `Rate limit exceeded. Backing off for ${retryAfter/1000} seconds before retrying.`
              );
              
              // Return an observable that will retry after delay
              return timer(retryAfter).pipe(
                mergeMap(() => this.httpService.get(url, { params, headers })),
                map(response => response.data),
                catchError(retryError => {
                  this.logger.error(
                    `Retry failed after rate limit error: ${retryError.message}`,
                    `Error details: ${JSON.stringify(errorDetails, null, 2)}`
                  );
                  this.recordApiError(retryError);
                  throw new HttpException(
                    retryError.response?.data || "GeoDB API Error after retry",
                    retryError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
                  );
                })
              );
            }
            
            this.logger.error(
              `GeoDB API error: ${error.message}`,
              `Error details: ${JSON.stringify(errorDetails, null, 2)}`
            );
            
            this.recordApiError(error);
            throw new HttpException(
              error.response?.data || "GeoDB API Error",
              error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
          })
        )
      );

      // Record metrics
      this.recordApiCall(Date.now() - startTime);

      // Cache the result for 24 hours
      await this.redisService.setJson(cacheKey, response, 86400);

      return response;
    } catch (error) {
      this.logger.error(`Error fetching cities: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Fetch a city by ID from the GeoDB API
   * @param cityId - ID of the city to fetch
   * @returns Promise<any> - City data
   */
  async getCityById(cityId: string): Promise<any> {
    // Validate city ID
    if (!cityId) {
      this.logger.error('City ID is required');
      throw new Error('City ID is required');
    }

    // Ensure cityId is a positive integer
    const cityIdNum = Number(cityId);
    if (isNaN(cityIdNum) || cityIdNum <= 0 || !Number.isInteger(cityIdNum)) {
      this.logger.error(`Invalid city ID format: ${cityId}`);
      throw new Error('City ID must be a positive integer');
    }

    // Check cache first
    const cacheKey = `geodb:city:${cityId}`;
    const cachedData = await this.redisService.getJson<any>(cacheKey);

    if (cachedData) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      return cachedData;
    }

    await this.applyRateLimit();

    const startTime = Date.now();

    try {
      const headers = {
        "X-RapidAPI-Key": this.apiKey,
        "X-RapidAPI-Host": new URL(this.baseUrl).hostname,
      };

      const url = `${this.baseUrl}/v1/geo/cities/${cityId}`;

      const response = await firstValueFrom(
        this.httpService.get(url, { headers }).pipe(
          map((response) => response.data),
          catchError((error: AxiosError) => {
            const errorDetails = {
              message: error.message,
              response: error.response?.data,
              status: error.response?.status,
              url: url,
              cityId: cityId
            };
            
            this.logger.error(
              `GeoDB API error when fetching city ${cityId}: ${error.message}`,
              `Error details: ${JSON.stringify(errorDetails, null, 2)}`
            );
            
            this.recordApiError(error);
            throw new HttpException(
              (error.response?.data && typeof error.response.data === 'object' && 'message' in error.response.data) 
                ? error.response.data.message 
                : "Error fetching city data",
              error.response?.status || 500
            );
          })
        )
      );

      // Record successful API call
      const responseTime = Date.now() - startTime;
      this.recordApiCall(responseTime);

      // Cache the result with TTL
      await this.redisService.setJson(cacheKey, response, 60 * 60); // Cache for 1 hour
      this.logger.log(`Cached city ${cityId} for 1 hour`);

      return response;
    } catch (error) {
      this.logger.error(
        `Error fetching city ${cityId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get all cities with automatic pagination handling
   * @param params - Query parameters
   * @param maxRecords - Maximum number of records to fetch
   * @returns Promise<any[]> - All city data
   */
  async getAllCities(
    params: Record<string, any> = {},
    maxRecords: number = 1000
  ): Promise<any[]> {
    this.logger.log(
      `Fetching up to ${maxRecords} cities with params: ${JSON.stringify(
        params
      )}`
    );

    // Check cache for the entire dataset if chunk processing is not required
    if (!params.processChunkCallback && !params.clearAfterProcessing) {
      const cacheKey = `geodb:allCities:${maxRecords}:${JSON.stringify(
        params
      )}`;
      const cachedData = await this.redisService.getJson<any[]>(cacheKey);

      if (cachedData) {
        this.logger.log(
          `Cache hit for ${cacheKey}, returning ${cachedData.length} cities`
        );
        return cachedData;
      }
    }

    // Limit maxRecords to avoid excessive memory usage
    const actualMaxRecords = Math.min(maxRecords, 5000);
    if (actualMaxRecords < maxRecords) {
      this.logger.warn(
        `Limiting request to ${actualMaxRecords} records to prevent memory issues`
      );
    }

    // BASIC plan only allows 10 records per request
    const pageSize = 10; // Reduced from 100 to comply with BASIC plan limits

    // Parallel processing if flag is set
    const useParallel = params.parallel === true;
    const maxConcurrent = params.maxConcurrent || 1;

    if (useParallel && params.maxConcurrent && params.maxConcurrent > 1) {
      this.logger.warn(
        "Parallel requests with maxConcurrent > 1 may exceed rate limits for BASIC plan. Consider setting maxConcurrent to 1."
      );
      return this.getAllCitiesParallel(
        params,
        actualMaxRecords,
        pageSize,
        maxConcurrent
      );
    }

    // Standard sequential processing
    let offset = 0;
    let allCities = [];
    let hasMore = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (hasMore && allCities.length < actualMaxRecords) {
      try {
        const response = await this.getCities(offset, pageSize, params);

        if (!response.data || response.data.length === 0) {
          hasMore = false;
          break;
        }

        allCities = [...allCities, ...response.data];
        offset += pageSize;
        consecutiveErrors = 0;

        this.logger.log(
          `Fetched ${response.data.length} cities, total so far: ${allCities.length}`
        );

        // Add a small delay between requests (polite scraping)
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Free memory: if we've collected a lot of cities, process them in chunks
        // to avoid keeping everything in memory
        if (
          allCities.length > 500 &&
          typeof params.processChunkCallback === "function"
        ) {
          await params.processChunkCallback(
            allCities.slice(-response.data.length)
          );

          // If callback is provided, we can clear the main array to save memory
          // since the callback should be handling the data
          if (params.clearAfterProcessing) {
            const count = allCities.length;
            allCities = [];
            this.logger.log(`Cleared ${count} processed cities from memory`);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error fetching batch of cities at offset ${offset}: ${error.message}`
        );

        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          this.logger.error(
            `Reached maximum consecutive errors (${maxConsecutiveErrors}), stopping fetch`
          );
          break;
        }

        // Retry with exponential backoff
        const retryDelay = Math.min(
          1000 * Math.pow(1.5, Math.floor(offset / pageSize) % 5),
          15000
        );
        this.logger.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // Force garbage collection if available (Node.js with --expose-gc flag)
    if (global.gc) {
      this.logger.log("Forcing garbage collection");
      global.gc();
    }

    this.logger.log(
      `Finished fetching cities. Total retrieved: ${allCities.length}`
    );

    // Cache the result if it's not empty and chunk processing is not required
    if (
      allCities.length > 0 &&
      !params.processChunkCallback &&
      !params.clearAfterProcessing
    ) {
      const cacheKey = `geodb:allCities:${maxRecords}:${JSON.stringify(
        params
      )}`;
      await this.redisService.setJson(cacheKey, allCities, 86400); // cache for 24 hours
      this.logger.log(
        `Cached ${allCities.length} cities with key ${cacheKey}`
      );
    }

    return allCities;
  }

  /**
   * Get all cities using parallel requests (within rate limits)
   */
  private async getAllCitiesParallel(
    params: Record<string, any>,
    maxRecords: number,
    pageSize: number,
    maxConcurrent: number
  ): Promise<any[]> {
    this.logger.log(
      `Fetching up to ${maxRecords} cities with parallel processing (max ${maxConcurrent} concurrent requests)`
    );

    // Calculate the number of required requests
    const totalRequests = Math.ceil(maxRecords / pageSize);
    const batchSize = maxConcurrent;
    const batches = Math.ceil(totalRequests / batchSize);

    let allCities = [];
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    // Process request batches
    for (let batch = 0; batch < batches; batch++) {
      const startOffset = batch * batchSize * pageSize;
      const requestsInBatch = Math.min(
        batchSize,
        totalRequests - batch * batchSize
      );

      this.logger.log(
        `Processing batch ${batch + 1}/${batches}, ${requestsInBatch} requests`
      );

      const batchRequests = Array.from({ length: requestsInBatch }).map(
        (_, i) => {
          const offset = startOffset + i * pageSize;
          return this.getCities(offset, pageSize, params).catch((error) => {
            this.logger.error(
              `Error in parallel request at offset ${offset}: ${error.message}`
            );
            consecutiveErrors++;
            return { data: [] }; // Return empty data on error
          });
        }
      );

      // Execute requests in parallel
      const batchResults = await Promise.all(batchRequests);

      // Process results
      const batchCities = batchResults.flatMap((result) => result.data || []);
      allCities = [...allCities, ...batchCities];

      this.logger.log(
        `Batch ${batch + 1} fetched ${
          batchCities.length
        } cities, total so far: ${allCities.length}`
      );

      // Check if we need to stop due to errors
      if (consecutiveErrors >= maxConsecutiveErrors) {
        this.logger.error(
          `Reached maximum consecutive errors (${maxConsecutiveErrors}), stopping fetch`
        );
        break;
      }

      // Check if we've reached the maximum number of records
      if (allCities.length >= maxRecords) {
        break;
      }

      // Give the API server a break between batches
      if (batch < batches - 1) {
        const delay = 1000; // 1 second between batches
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Process chunks (if required)
      if (
        allCities.length > 500 &&
        typeof params.processChunkCallback === "function"
      ) {
        await params.processChunkCallback(batchCities);

        if (params.clearAfterProcessing) {
          const count = allCities.length;
          allCities = [];
          this.logger.log(`Cleared ${count} processed cities from memory`);
        }
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      this.logger.log("Forcing garbage collection");
      global.gc();
    }

    // Cache the result if it's not empty and chunk processing is not required
    if (
      allCities.length > 0 &&
      !params.processChunkCallback &&
      !params.clearAfterProcessing
    ) {
      const cacheKey = `geodb:allCities:${maxRecords}:${JSON.stringify(
        params
      )}`;
      await this.redisService.setJson(cacheKey, allCities, 86400); // cache for 24 hours
      this.logger.log(
        `Cached ${allCities.length} cities with key ${cacheKey}`
      );
    }

    this.logger.log(
      `Finished fetching cities with parallel processing. Total retrieved: ${allCities.length}`
    );
    return allCities;
  }

  /**
   * Records API call metrics
   * @param responseTime - Response time in milliseconds
   */
  private async recordApiCall(responseTime: number): Promise<void> {
    try {
      // Record API call count
      await this.timeSeriesService.addDataPoint("metrics:geodb:api_calls", 1);

      // Record response time
      await this.timeSeriesService.addDataPoint(
        "metrics:geodb:response_time",
        responseTime
      );
    } catch (error) {
      this.logger.error(
        `Error recording API metrics: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Records API error metrics
   * @param error - Error object
   */
  private async recordApiError(error: AxiosError): Promise<void> {
    try {
      await this.timeSeriesService.addDataPoint("metrics:geodb:api_errors", 1);
    } catch (metricError) {
      this.logger.error(
        `Error recording API error metrics: ${metricError.message}`,
        metricError.stack
      );
    }
  }
}
