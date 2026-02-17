import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserPublic } from '../user/entity/user.entity';
import { UserService } from '../user/user.service';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private usersService: UserService,
    private jwtService: JwtService,
  ) {}

  encryptPassword(password: string) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async validateUser(email: string, pass: string): Promise<UserPublic | null> {
    const user = await this.usersService.findOneByEmail(email, true);
    const validPassowrd = await (user
      ? bcrypt.compare(pass, user?.password)
      : false);

    if (validPassowrd) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user!;
      return result;
    }

    return null;
  }

  login(user: UserPublic) {
    const payload = { email: user.email, name: user.name, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
