import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const bucket = this.configService.get<string>('AWS_S3_BUCKET');
    if (!bucket) {
      throw new Error('AWS_S3_BUCKET environment variable is not set');
    }
    this.bucket = bucket;

    this.client = new S3Client({
      endpoint: this.configService.get<string>('AWS_S3_ENDPOINT'),
      region: this.configService.get<string>('AWS_S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.configService.get<string>(
          'AWS_S3_ACCESS_KEY_ID',
          'test',
        ),
        secretAccessKey: this.configService.get<string>(
          'AWS_S3_SECRET_ACCESS_KEY',
          'test',
        ),
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket "${this.bucket}" already exists`);
    } catch (error: unknown) {
      const isNotFound =
        error instanceof Error &&
        ('$metadata' in error
          ? (error as { $metadata: { httpStatusCode?: number } }).$metadata
              .httpStatusCode === 404
          : error.name === 'NotFound');

      if (!isNotFound) {
        throw error;
      }

      this.logger.log(`Creating S3 bucket "${this.bucket}"...`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket "${this.bucket}" created`);
    }
  }

  async upload(
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.log(`Uploaded object to S3: ${key}`);
  }

  async download(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const content = await response.Body!.transformToString('utf-8');
    this.logger.log(`Downloaded object from S3: ${key}`);
    return content;
  }
}
