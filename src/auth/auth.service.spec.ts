import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockUserService = {
    findOneByEmail: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('encryptPassword', () => {
    it('should hash the password with bcrypt', async () => {
      const password = 'mypassword';
      const hashedPassword = 'hashed-password';
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.encryptPassword(password);

      expect(result).toBe(hashedPassword);
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
    });
  });

  describe('validateUser', () => {
    const email = 'test@example.com';
    const password = 'password123';
    const userWithPassword = {
      id: 'user-123',
      name: 'Test User',
      email,
      password: 'hashed-password',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should return user without password when credentials are valid', async () => {
      mockUserService.findOneByEmail.mockResolvedValue(userWithPassword);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(email, password);

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email,
        createdAt: userWithPassword.createdAt,
        updatedAt: userWithPassword.updatedAt,
        deletedAt: null,
      });
      expect(result).not.toHaveProperty('password');
      expect(mockUserService.findOneByEmail).toHaveBeenCalledWith(email, true);
      expect(bcrypt.compare).toHaveBeenCalledWith(password, 'hashed-password');
    });

    it('should return null when user does not exist', async () => {
      mockUserService.findOneByEmail.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null when password is incorrect', async () => {
      mockUserService.findOneByEmail.mockResolvedValue(userWithPassword);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return JWT with correct payload structure', () => {
      const user = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const expectedToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(expectedToken);

      const result = service.login(user);

      expect(result).toEqual({ access_token: expectedToken });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: user.email,
        name: user.name,
        sub: user.id,
      });
    });
  });
});
