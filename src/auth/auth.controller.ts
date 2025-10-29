import { Controller, Post, Request, UseGuards } from '@nestjs/common';
import type { Request as Req } from 'express';
import { LocalAuthGuard } from './local-auth.guard';
import { AuthService } from './auth.service';
import { UserPublic } from 'src/user/entity/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: Req) {
    return this.authService.login(req.user as UserPublic);
  }
}
