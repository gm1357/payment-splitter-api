import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email, deletedAt: null },
    });

    if (existingUser) {
      throw new BadRequestException('invalid email');
    }

    const hashedPassword = await this.authService.encryptPassword(
      createUserDto.password,
    );

    return this.prisma.user.create({
      data: { ...createUserDto, password: hashedPassword },
      omit: { password: true, deletedAt: true },
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      omit: { password: true, deletedAt: true },
      where: { deletedAt: null },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      omit: { password: true, deletedAt: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  findOneByEmail(email: string, getPassword = false) {
    return this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      omit: { password: !getPassword, deletedAt: true },
    });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  remove(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
