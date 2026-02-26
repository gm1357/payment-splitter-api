import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { request, spec } from 'pactum';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  SQSClient,
  GetQueueUrlCommand,
  DeleteQueueCommand,
  CreateQueueCommand,
} from '@aws-sdk/client-sqs';

const EMAIL_HTTP_URL = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

const s3Client = new S3Client({
  endpoint: process.env.AWS_S3_ENDPOINT || 'http://localhost:4566',
  region: process.env.AWS_S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || 'test',
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'expense-uploads';

const sqsClient = new SQSClient({
  endpoint: process.env.AWS_SQS_ENDPOINT || 'http://localhost:4566',
  region: process.env.AWS_SQS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_SQS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SQS_SECRET_ACCESS_KEY || 'test',
  },
});

const SQS_QUEUE_NAME = process.env.AWS_SQS_QUEUE_NAME || 'expense-upload-queue';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe());
  await app.init();
  await app.listen(0); // Listen on random port

  const url = await app.getUrl();
  request.setBaseUrl(url);

  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.log({ error });
  }
}

export async function deleteAllEmails() {
  try {
    const res = await fetch(`${EMAIL_HTTP_URL}/messages`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(
        `Failed to delete emails: ${res.status} ${res.statusText}`,
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Could not connect to email service at ${EMAIL_HTTP_URL}. Ensure MailCatcher is running.`,
      );
    }
    throw error;
  }
}

export async function getEmails() {
  try {
    const emailListRes = await fetch(`${EMAIL_HTTP_URL}/messages`);
    if (!emailListRes.ok) {
      throw new Error(
        `Failed to fetch emails: ${emailListRes.status} ${emailListRes.statusText}`,
      );
    }
    const emailList: {
      id: number;
      sender: string;
      recipients: string[];
      subject: string;
      size: string;
      created_at: string;
    }[] = await emailListRes.json();

    return emailList;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Could not connect to email service at ${EMAIL_HTTP_URL}. Ensure MailCatcher is running.`,
      );
    }
    throw error;
  }
}

export async function getEmailTextById(id: number): Promise<string> {
  try {
    const res = await fetch(`${EMAIL_HTTP_URL}/messages/${id}.plain`);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch email text: ${res.status} ${res.statusText}`,
      );
    }
    return res.text();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Could not connect to email service at ${EMAIL_HTTP_URL}. Ensure MailCatcher is running.`,
      );
    }
    throw error;
  }
}

export async function getLastEmail() {
  const emailList = await getEmails();
  const lastEmailItem = emailList.pop();

  if (!lastEmailItem) {
    return null;
  }

  const emailTextBody = await getEmailTextById(lastEmailItem.id);

  return {
    ...lastEmailItem,
    text: emailTextBody,
  };
}

export async function listS3Objects(prefix: string) {
  const response = await s3Client.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }),
  );
  return response.Contents ?? [];
}

export async function getS3ObjectContent(key: string): Promise<string> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
  return response.Body!.transformToString('utf-8');
}

export async function clearS3Bucket() {
  const objects = await s3Client.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET }),
  );

  if (!objects.Contents || objects.Contents.length === 0) {
    return;
  }

  const keys: string[] = objects.Contents.map((obj) => obj.Key).filter(
    (key): key is string => key !== undefined,
  );

  if (keys.length === 0) {
    return;
  }

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    }),
  );
}

export async function purgeQueue() {
  try {
    const urlResult = await sqsClient.send(
      new GetQueueUrlCommand({ QueueName: SQS_QUEUE_NAME }),
    );
    // Delete and recreate the queue to remove ALL messages including invisible
    // (in-flight) ones. PurgeQueue and drain-based approaches cannot remove
    // invisible messages, which can interfere with subsequent tests.
    await sqsClient.send(
      new DeleteQueueCommand({ QueueUrl: urlResult.QueueUrl }),
    );
  } catch {
    // Queue may not exist yet; ignore
  }
  await sqsClient.send(new CreateQueueCommand({ QueueName: SQS_QUEUE_NAME }));
}

export async function waitForExpenses(
  app: INestApplication,
  groupId: string,
  expectedCount: number,
  accessToken: string,
  timeoutMs = 10000,
): Promise<unknown[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const expenses: unknown[] = await spec()
      .get('/expense/group/{groupId}')
      .withPathParams('groupId', groupId)
      .withBearerToken(accessToken)
      .returns('res.body');

    if (Array.isArray(expenses) && expenses.length >= expectedCount) {
      return expenses;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `Timed out waiting for ${expectedCount} expenses in group ${groupId}`,
  );
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
}

export { spec };
