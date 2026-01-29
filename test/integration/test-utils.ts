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

  await prisma.$transaction([
    prisma.expenseSplit.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.settlement.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.group.deleteMany(),
    prisma.user.deleteMany(),
  ]);
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

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: objects.Contents.map((obj) => ({ Key: obj.Key })),
      },
    }),
  );
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
}

export { spec };
