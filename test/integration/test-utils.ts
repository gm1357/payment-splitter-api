import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { request, spec } from 'pactum';

const EMAIL_HTTP_URL = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

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
  await fetch(`${EMAIL_HTTP_URL}/messages`, {
    method: 'DELETE',
  });
}

export async function getEmails() {
  const emailListRes = await fetch(`${EMAIL_HTTP_URL}/messages`);
  const emailList: {
    id: number;
    sender: string;
    recipients: string[];
    subject: string;
    size: string;
    created_at: string;
  }[] = await emailListRes.json();

  return emailList;
}

export async function getLastEmail() {
  const emailList = await getEmails();
  const lastEmailItem = emailList.pop();

  if (!lastEmailItem) {
    return null;
  }

  const lastEmailTextRes = await fetch(
    `${EMAIL_HTTP_URL}/messages/${lastEmailItem.id}.plain`,
  );
  const emailTextBody = await lastEmailTextRes.text();

  return {
    ...lastEmailItem,
    text: emailTextBody,
  };
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
}

export { spec };
