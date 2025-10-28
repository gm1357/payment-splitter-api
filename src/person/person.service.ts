import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PersonService {
  constructor(private prisma: PrismaService) {}

  async create(createPersonDto: CreatePersonDto) {
    const existingPerson = await this.prisma.person.findUnique({
      where: { email: createPersonDto.email },
    });

    if (existingPerson) {
      throw new BadRequestException('invalid email');
    }

    return this.prisma.person.create({ data: createPersonDto });
  }

  findAll() {
    return this.prisma.person.findMany();
  }

  findOne(id: string) {
    return this.prisma.person.findUnique({ where: { id } });
  }

  update(id: string, updatePersonDto: UpdatePersonDto) {
    return this.prisma.person.update({ where: { id }, data: updatePersonDto });
  }

  remove(id: string) {
    return this.prisma.person.delete({ where: { id } });
  }
}
