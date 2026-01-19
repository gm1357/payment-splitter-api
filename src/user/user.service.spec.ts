import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: jest.Mocked<PrismaService>;
  let authService: jest.Mocked<AuthService>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAuthService = {
    encryptPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get(PrismaService);
    authService = module.get(AuthService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    it('should throw BadRequestException when email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: createUserDto.email,
      });

      await expect(service.create(createUserDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createUserDto)).rejects.toThrow('invalid email');
    });

    it('should hash password before saving', async () => {
      const hashedPassword = 'hashed-password';
      const createdUser = {
        id: 'user-123',
        name: createUserDto.name,
        email: createUserDto.email,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockAuthService.encryptPassword.mockResolvedValue(hashedPassword);
      mockPrismaService.user.create.mockResolvedValue(createdUser);

      const result = await service.create(createUserDto);

      expect(mockAuthService.encryptPassword).toHaveBeenCalledWith(
        createUserDto.password,
      );
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          name: createUserDto.name,
          email: createUserDto.email,
          password: hashedPassword,
        },
        omit: { password: true, deletedAt: true },
      });
      expect(result).toEqual(createdUser);
    });
  });

  describe('findOne', () => {
    it('should return user when found', async () => {
      const userId = 'user-123';
      const expectedUser = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(expectedUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId, deletedAt: null },
        omit: { password: true, deletedAt: true },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('findAll', () => {
    it('should return all non-deleted users without passwords', async () => {
      const expectedUsers = [
        { id: 'user-1', name: 'User 1', email: 'user1@example.com' },
        { id: 'user-2', name: 'User 2', email: 'user2@example.com' },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(expectedUsers);

      const result = await service.findAll();

      expect(result).toEqual(expectedUsers);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        omit: { password: true, deletedAt: true },
        where: { deletedAt: null },
      });
    });
  });

  describe('findOneByEmail', () => {
    const email = 'john@example.com';

    it('should return user without password by default', async () => {
      const expectedUser = { id: 'user-123', name: 'John', email };
      mockPrismaService.user.findUnique.mockResolvedValue(expectedUser);

      const result = await service.findOneByEmail(email);

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email, deletedAt: null },
        omit: { password: true, deletedAt: true },
      });
    });

    it('should return user with password when getPassword is true', async () => {
      const expectedUser = {
        id: 'user-123',
        name: 'John',
        email,
        password: 'hashed',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(expectedUser);

      const result = await service.findOneByEmail(email, true);

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email, deletedAt: null },
        omit: { password: false, deletedAt: true },
      });
    });
  });

  describe('update', () => {
    it('should update user with provided data', async () => {
      const userId = 'user-123';
      const updateUserDto = { name: 'Updated Name' };
      const updatedUser = { id: userId, name: 'Updated Name', email: 'john@example.com' };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: updateUserDto,
      });
    });
  });

  describe('remove', () => {
    it('should soft delete user by setting deletedAt', async () => {
      const userId = 'user-123';
      const deletedUser = {
        id: userId,
        name: 'John',
        deletedAt: expect.any(Date),
      };
      mockPrismaService.user.update.mockResolvedValue(deletedUser);

      await service.remove(userId);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
