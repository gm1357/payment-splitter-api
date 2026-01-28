import {
  Body,
  Controller,
  Get,
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

@Controller('expense')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createExpenseDto: CreateExpenseDto, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.create(createExpenseDto, user.id);
  }

  @Post('upload/:groupId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadExpenses(
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
    return this.expenseService.createBatch(params.groupId, csvContent, user.id);
  }

  @Get('group/:groupId')
  @UseGuards(JwtAuthGuard)
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.listByGroup(groupId, user.id);
  }
}
