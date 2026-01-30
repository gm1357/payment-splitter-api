import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SqsService } from 'src/infra/sqs/sqs.service';
import { S3Service } from 'src/infra/s3/s3.service';
import { ExpenseService } from './expense.service';
import { ExpenseUploadMessage } from './dto/upload-expenses.dto';

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private running = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly sqsService: SqsService,
    private readonly s3Service: S3Service,
    private readonly expenseService: ExpenseService,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  onModuleDestroy() {
    this.running = false;
    this.abortController?.abort();
  }

  private startPolling() {
    this.running = true;
    this.poll().catch((error: Error) => {
      this.logger.error(`Polling loop exited with error: ${error.message}`);
    });
  }

  private async poll() {
    while (this.running) {
      try {
        this.abortController = new AbortController();
        const messages = await this.sqsService.receiveMessages({
          abortSignal: this.abortController.signal,
        });

        for (const message of messages) {
          await this.processMessage(message.Body!, message.ReceiptHandle!);
        }
      } catch (error: unknown) {
        if (!this.running) break;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Error during SQS polling: ${errorMessage}`);
      }
    }
  }

  private async processMessage(
    body: string,
    receiptHandle: string,
  ): Promise<void> {
    let parsed: ExpenseUploadMessage;
    try {
      parsed = JSON.parse(body) as ExpenseUploadMessage;
    } catch {
      this.logger.error(`Failed to parse SQS message body: ${body}`);
      // Delete malformed messages to avoid infinite retries
      await this.sqsService.deleteMessage(receiptHandle);
      return;
    }

    const { s3Key, groupId, userId } = parsed;

    try {
      const csvContent = await this.s3Service.download(s3Key);
      await this.expenseService.createBatch(groupId, csvContent, userId);
      await this.sqsService.deleteMessage(receiptHandle);
      this.logger.log(
        `Successfully processed expense upload for group ${groupId}, S3 key: ${s3Key}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process expense upload for group ${groupId}, S3 key: ${s3Key}: ${errorMessage}`,
      );
      // Do NOT delete message — SQS will retry automatically
    }
  }
}
