import { ForbiddenException, NotFoundException } from '@nestjs/common';

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
}
