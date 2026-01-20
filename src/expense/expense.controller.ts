import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
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

  @Get('group/:groupId')
  @UseGuards(JwtAuthGuard)
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.expenseService.listByGroup(groupId, user.id);
  }
}
