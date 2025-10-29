import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  encryptPassword(password: string) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }
}
