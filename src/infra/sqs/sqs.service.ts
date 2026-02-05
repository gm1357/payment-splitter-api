import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  CreateQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  Message,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService implements OnModuleInit {
  private readonly logger = new Logger(SqsService.name);
  private readonly client: SQSClient;
  private readonly queueName: string;
  private readonly pollWaitSeconds: number;
  private queueUrl: string;

  constructor(private readonly configService: ConfigService) {
    const queueName = this.configService.get<string>('AWS_SQS_QUEUE_NAME');
    if (!queueName) {
      throw new Error('AWS_SQS_QUEUE_NAME environment variable is not set');
    }
    this.queueName = queueName;
    this.pollWaitSeconds = this.configService.get<number>(
      'AWS_SQS_POLL_WAIT_SECONDS',
      20,
    );

    this.client = new SQSClient({
      endpoint: this.configService.get<string>('AWS_SQS_ENDPOINT'),
      region: this.configService.get<string>('AWS_SQS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>(
          'AWS_SQS_ACCESS_KEY_ID',
          'test',
        ),
        secretAccessKey: this.configService.get<string>(
          'AWS_SQS_SECRET_ACCESS_KEY',
          'test',
        ),
      },
    });
  }

  async onModuleInit() {
    try {
      const result = await this.client.send(
        new GetQueueUrlCommand({ QueueName: this.queueName }),
      );
      this.queueUrl = result.QueueUrl!;
      this.logger.log(`SQS queue "${this.queueName}" already exists`);
    } catch (error: unknown) {
      const isNotFound =
        error instanceof Error && error.name === 'QueueDoesNotExist';

      if (!isNotFound) {
        const isNonExistent =
          error instanceof Error &&
          error.name === 'AWS.SimpleQueueService.NonExistentQueue';

        if (!isNonExistent) {
          throw error;
        }
      }

      this.logger.log(`Creating SQS queue "${this.queueName}"...`);
      const result = await this.client.send(
        new CreateQueueCommand({ QueueName: this.queueName }),
      );
      this.queueUrl = result.QueueUrl!;
      this.logger.log(`SQS queue "${this.queueName}" created`);
    }
  }

  async healthCheck(): Promise<void> {
    await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ['QueueArn'],
      }),
    );
  }

  async sendMessage(body: object): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(body),
      }),
    );
    this.logger.log(`Sent message to SQS queue "${this.queueName}"`);
  }

  async receiveMessages(options?: {
    abortSignal?: AbortSignal;
  }): Promise<Message[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        WaitTimeSeconds: this.pollWaitSeconds,
        MaxNumberOfMessages: 10,
      }),
      { abortSignal: options?.abortSignal },
    );
    return result.Messages ?? [];
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
