import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { ApiProperty } from "@nestjs/swagger";

@Schema({
  versionKey: false,
  collection: "cities",
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  },
})
export class City extends Document {
  @ApiProperty({ description: "City unique ID (from GeoDB)", example: 1234 })
  @Prop({ required: true, unique: true, index: true })
  cityId: number;

  @ApiProperty({ description: "City name", example: "New York" })
  @Prop({ required: true, index: true })
  name: string;

  @ApiProperty({ description: "Country code", example: "US" })
  @Prop({ required: true, index: true })
  countryCode: string;

  @ApiProperty({ description: "Country name", example: "United States" })
  @Prop({ required: true })
  country: string;

  @ApiProperty({ description: "Region code", example: "NY" })
  @Prop()
  regionCode: string;

  @ApiProperty({ description: "Region name", example: "New York" })
  @Prop()
  region: string;

  @ApiProperty({ description: "City latitude", example: 40.7128 })
  @Prop()
  latitude: number;

  @ApiProperty({ description: "City longitude", example: -74.006 })
  @Prop()
  longitude: number;

  @ApiProperty({ description: "Population", example: 8804190 })
  @Prop()
  population: number;

  @ApiProperty({ description: "City timezone", example: "America/New_York" })
  @Prop()
  timezone: string;

  @ApiProperty({ description: "Currency code", example: "USD" })
  @Prop()
  currencyCode: string;

  @ApiProperty({ description: "Wiki data ID", example: "Q60" })
  @Prop()
  wikiDataId: string;

  @ApiProperty({
    description: "Date when the data was last updated",
    example: "2023-03-15T14:30:45.123Z",
  })
  @Prop({ default: Date.now })
  lastUpdated: Date;
}

export const CitySchema = SchemaFactory.createForClass(City);

// indexes for performance
CitySchema.index({ name: "text", country: "text" });
CitySchema.index({ countryCode: 1, regionCode: 1 });
CitySchema.index({ population: -1 });
CitySchema.index({ lastUpdated: -1 });
