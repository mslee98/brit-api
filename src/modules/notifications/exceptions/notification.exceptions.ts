import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

export class NotificationDomainException {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOTIFICATION_NOT_FOUND',
      message: '알림을 찾을 수 없어요.',
    });
  }

  static forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'NOTIFICATION_FORBIDDEN',
      message: '이 알림에 접근할 수 없어요.',
    });
  }

  static pushTestNotAllowed(): ForbiddenException {
    return new ForbiddenException({
      code: 'PUSH_TEST_NOT_ALLOWED',
      message: '테스트 푸시는 개발 환경에서만 보낼 수 있어요.',
    });
  }

  static pushNotConfigured(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'PUSH_NOT_CONFIGURED',
      message: '지금은 알림을 켤 수 없어요.',
    });
  }

  static pushSubscriptionNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PUSH_SUBSCRIPTION_NOT_FOUND',
      message: '알림 구독을 찾을 수 없어요.',
    });
  }
}
