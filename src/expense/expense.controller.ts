import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import {
  ApiBearerAuth,
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  ExpenseUploadMessage,
  UploadAcceptedResponseDto,
  UploadExpensesParamsDto,
} from './dto/upload-expenses.dto';
import type { Request } from 'express';
import { JWTUser } from '../auth/entity/jwt.entity';
import { S3Service } from '../infra/s3/s3.service';
import { SqsService } from '../infra/sqs/sqs.service';
import { CsvParserService } from './csv-parser.service';

@ApiTags('Expense')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expense')
export class ExpenseController {
  private readonly logger = new Logger(ExpenseController.name);

  constructor(
    private readonly expenseService: ExpenseService,
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly csvParserService: CsvParserService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiCreatedResponse({ description: 'Expense created with splits' })
  create(@Body() createExpenseDto: CreateExpenseDto, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.create(createExpenseDto, user.id);
  }

  @Post('upload/:groupId')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload expenses via CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV file (max 1MB)',
        },
      },
      required: ['file'],
    },
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiAcceptedResponse({
    type: UploadAcceptedResponseDto,
    description: 'Upload accepted for async processing',
  })
  @ApiBadRequestResponse({ description: 'CSV validation failed' })
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
  ): Promise<UploadAcceptedResponseDto> {
    const user = request.user as JWTUser;
    const csvContent = file.buffer.toString('utf-8');

    // Validate CSV structure synchronously (format, headers, row count)
    const validation = this.csvParserService.validateStructure(csvContent);
    if (!validation.valid) {
      const errorMsg = validation.error ?? '';
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: [
          {
            row: 0,
            field: errorMsg.includes('headers') ? 'headers' : 'csv',
            message: errorMsg,
            value: '',
          },
        ],
      });
    }

    // Upload to S3
    const timestamp = Date.now();
    const filename = (file.originalname || 'upload.csv').replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const key = `expenses/${params.groupId}/${timestamp}-${filename}`;
    await this.s3Service.upload(key, file.buffer, 'text/csv');

    // Send SQS message for async processing
    const message: ExpenseUploadMessage = {
      s3Key: key,
      groupId: params.groupId,
      userId: user.id,
    };
    await this.sqsService.sendMessage(message);

    this.logger.log(
      `Upload accepted for group ${params.groupId}, S3 key: ${key}`,
    );

    return {
      message: 'Upload accepted for processing',
      s3Key: key,
    };
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'List expenses for a group' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ description: 'List of expenses' })
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.listByGroup(groupId, user.id);
  }
}
