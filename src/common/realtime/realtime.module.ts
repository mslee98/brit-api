import { Global, Module } from '@nestjs/common';

import { RealtimeSessionRegistry } from './realtime-session.registry';

@Global()
@Module({
  providers: [RealtimeSessionRegistry],
  exports: [RealtimeSessionRegistry],
})
export class RealtimeModule {}
