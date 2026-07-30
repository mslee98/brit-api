import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * JWT·역할 Guard만 제공하는 얇은 모듈.
 * AuthService와 분리해 Users/Notifications가 AuthModule과 순환하지 않게 한다.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthGuardsModule {}
