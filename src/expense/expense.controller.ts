import {
  Body,
  Controller,
  Get,
  Logger,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UploadExpensesParamsDto } from './dto/upload-expenses.dto';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';
import { S3Service } from 'src/infra/s3/s3.service';

@Controller('expense')
export class ExpenseController {
  private readonly logger = new Logger(ExpenseController.name);

  constructor(
    private readonly expenseService: ExpenseService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createExpenseDto: CreateExpenseDto, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.create(createExpenseDto, user.id);
  }

  @Post('upload/:groupId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }),
  )
  async uploadExpenses(
    @Param() params: UploadExpensesParamsDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 }), // 1MB
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() request: Request,
  ) {
    const user = request.user as JWTUser;
    const csvContent = file.buffer.toString('utf-8');
    const result = await this.expenseService.createBatch(
      params.groupId,
      csvContent,
      user.id,
    );

    const timestamp = Date.now();
    const filename = (file.originalname || 'upload.csv').replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const key = `expenses/${params.groupId}/${timestamp}-${filename}`;
    this.s3Service
      .upload(key, file.buffer, 'text/csv')
      .catch((error: Error) =>
        this.logger.warn(`Failed to upload CSV to S3: ${error.message}`),
      );

    return result;
  }

  @Get('group/:groupId')
  @UseGuards(JwtAuthGuard)
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.listByGroup(groupId, user.id);
  }
}
