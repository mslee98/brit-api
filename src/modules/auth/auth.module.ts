import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BanksModule } from '../banks/banks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthGuardsModule } from './auth-guards.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserSessionEntity } from './infrastructure/entities/user-session.entity';

/**
 * 인증 모듈: 가입·로그인·토큰·세션.
 * UsersModule(UserService) + BanksModule + NotificationsModule + UserSessionEntity 소유.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserSessionEntity]),
    forwardRef(() => UsersModule),
    forwardRef(() => BanksModule),
    NotificationsModule,
    AuthGuardsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [TypeOrmModule, JwtModule, AuthGuardsModule, AuthService],
})
export class AuthModule {}
