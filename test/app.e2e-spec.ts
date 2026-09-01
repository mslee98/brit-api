import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { AdminUserApprovalsController } from '../src/modules/users/admin-user-approvals.controller';
import { UserService } from '../src/modules/users/user.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UserRole } from '../src/modules/users/domain/enums/user-role.enum';
import { UserStatus } from '../src/modules/users/domain/enums/user-status.enum';
import { UserBankAccountStatus } from '../src/modules/users/domain/enums/user-bank-account-status.enum';

describe('Auth + Registration Reviews (e2e)', () => {
  let app: INestApplication<App>;
  const authServiceMock = {
    checkLoginId: jest.fn(),
    checkNickname: jest.fn(),
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    getMe: jest.fn(),
    getRegistrationStatus: jest.fn(),
    updateRegistration: jest.fn(),
  };
  const userServiceMock = {
    listRegistrationReviews: jest.fn(),
    getRegistrationReviewDetail: jest.fn(),
    approveRegistration: jest.fn(),
    rejectRegistration: jest.fn(),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController, AdminUserApprovalsController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const request = context.switchToHttp().getRequest();
          request.user = {
            userId: '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8',
            sessionId: '674af8cb-a8c2-4df4-a8ea-95b8f0f53f8a',
            role: UserRole.SYS_ADMIN,
            status: UserStatus.PENDING,
            tokenType: 'access',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });

    const moduleFixture: TestingModule = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('POST /auth/register -> 201 + WAIT_FOR_APPROVAL', () => {
    authServiceMock.register.mockResolvedValue({
      userId: '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8',
      status: UserStatus.PENDING,
      nextAction: 'WAIT_FOR_APPROVAL',
    });

    return request(app.getHttpServer())
      .post('/auth/register')
      .send({
        loginId: 'minsung',
        password: 'password123!',
        name: '김민성',
        residentRegistrationNumber: '980101-1234567',
        mobileCarrier: 'SKT',
        phone: '01012345678',
        nickname: '민성',
        bankCode: 'KB',
        bankAccountNumber: '110123456789',
        bankAccountHolderName: '김민성',
        pin: '123456',
        consents: [
          { type: 'SERVICE', version: '1.0', agreed: true },
          { type: 'PRIVACY', version: '1.0', agreed: true },
          { type: 'UNIQUE_IDENTIFIER', version: '1.0', agreed: true },
          { type: 'BANK_ACCOUNT', version: '1.0', agreed: true },
        ],
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe(UserStatus.PENDING);
        expect(res.body.nextAction).toBe('WAIT_FOR_APPROVAL');
      });
  });

  it('POST /auth/login -> PENDING 제한 로그인 응답', () => {
    authServiceMock.login.mockResolvedValue({
      user: {
        id: '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8',
        loginId: 'minsung',
        nickname: '민성',
        phoneE164: '+821012345678',
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresInSec: 900,
      },
      nextAction: 'WAIT_FOR_APPROVAL',
    });

    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginId: 'minsung', password: 'password123!' })
      .expect(200)
      .expect((res) => {
        expect(res.body.tokens.accessToken).toBeDefined();
        expect(res.body.nextAction).toBe('WAIT_FOR_APPROVAL');
      });
  });

  it('GET /auth/registration-status -> UNDER_REVIEW', () => {
    authServiceMock.getRegistrationStatus.mockResolvedValue({
      userStatus: UserStatus.PENDING,
      bankAccountStatus: UserBankAccountStatus.PENDING_APPROVAL,
      registrationStatus: 'UNDER_REVIEW',
      submittedAt: '2026-08-11T00:00:00.000Z',
      rejection: null,
    });

    return request(app.getHttpServer())
      .get('/auth/registration-status')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.registrationStatus).toBe('UNDER_REVIEW');
      });
  });

  it('PATCH /auth/registration -> 계좌 재제출', () => {
    authServiceMock.updateRegistration.mockResolvedValue({
      userId: '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8',
      userStatus: UserStatus.PENDING,
      bankAccountStatus: UserBankAccountStatus.PENDING_APPROVAL,
      registrationStatus: 'UNDER_REVIEW',
    });

    return request(app.getHttpServer())
      .patch('/auth/registration')
      .set('Authorization', 'Bearer access-token')
      .send({
        bankAccount: {
          bankCode: 'KB',
          accountNumber: '110123456789',
          holderName: '김민성',
        },
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.bankAccountStatus).toBe(
          UserBankAccountStatus.PENDING_APPROVAL,
        );
      });
  });

  it('GET /admin/registration-reviews -> 목록 조회', () => {
    userServiceMock.listRegistrationReviews.mockResolvedValue({
      items: [
        {
          id: '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8',
          loginId: 'minsung',
          phoneE164: '+821012345678',
          status: UserStatus.PENDING,
        },
      ],
      pagination: { page: 1, size: 20, totalItems: 1, totalPages: 1 },
    });

    return request(app.getHttpServer())
      .get('/admin/registration-reviews?page=1&size=20')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.items).toHaveLength(1);
      });
  });

  it('POST /admin/registration-reviews/:userId/approve -> 동시 승인', () => {
    const userId = '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8';
    userServiceMock.approveRegistration.mockResolvedValue({
      userId,
      userStatus: UserStatus.ACTIVE,
      bankAccountStatus: UserBankAccountStatus.ACTIVE,
      registrationStatus: 'COMPLETED',
      approvedAt: '2026-08-11T00:00:00.000Z',
    });

    return request(app.getHttpServer())
      .post(`/admin/registration-reviews/${userId}/approve`)
      .set('Authorization', 'Bearer access-token')
      .send({
        identityChecked: true,
        phoneChecked: true,
        bankAccountChecked: true,
        holderNameMatched: true,
        reviewReason: '확인 완료',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.registrationStatus).toBe('COMPLETED');
      });
  });

  it('POST /admin/registration-reviews/:userId/reject -> 계좌만 반려', () => {
    const userId = '7f139e0a-6e5f-4fd8-95a2-f8a516f532f8';
    userServiceMock.rejectRegistration.mockResolvedValue({
      userId,
      userStatus: UserStatus.PENDING,
    });

    return request(app.getHttpServer())
      .post(`/admin/registration-reviews/${userId}/reject`)
      .set('Authorization', 'Bearer access-token')
      .send({
        targets: ['BANK_ACCOUNT'],
        reasonCode: 'BANK_ACCOUNT_MISMATCH',
        reason: '예금주 불일치',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.userStatus).toBe(UserStatus.PENDING);
      });
  });
});
