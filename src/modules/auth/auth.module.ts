import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BanksModule } from '../banks/banks.module';
import { UsersModule } from '../users/users.module';
import { AccountVerifyTokenService } from './account-verify-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserSessionEntity } from './infrastructure/entities/user-session.entity';

/**
 * 인증 모듈: 가입·로그인·토큰·세션.
 * UsersModule(UserService) + BanksModule + UserSessionEntity 소유.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserSessionEntity]),
    UsersModule,
    BanksModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountVerifyTokenService,
    JwtAuthGuard,
  ],
  exports: [TypeOrmModule, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
