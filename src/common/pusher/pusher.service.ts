import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

@Injectable()
export class PusherService implements OnModuleInit {
  private readonly logger = new Logger(PusherService.name);
  private pusher: Pusher | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      this.getClient();
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Failed to initialize Pusher',
      );
    }
  }

  private getClient(): Pusher {
    if (this.pusher) {
      return this.pusher;
    }

    const appId = this.configService.get<string>('PUSHER_APP_ID')?.trim();
    const key = this.configService.get<string>('PUSHER_KEY')?.trim();
    const secret = this.configService.get<string>('PUSHER_SECRET')?.trim();
    const cluster = this.configService.get<string>('PUSHER_CLUSTER')?.trim();

    const missing = [
      !appId && 'PUSHER_APP_ID',
      !key && 'PUSHER_KEY',
      !secret && 'PUSHER_SECRET',
      !cluster && 'PUSHER_CLUSTER',
    ].filter(Boolean);

    if (missing.length > 0) {
      const message = `Pusher is not configured. Missing env: ${missing.join(', ')}`;
      this.logger.error(message);
      throw new InternalServerErrorException(message);
    }

    this.pusher = new Pusher({
      appId: appId!,
      key: key!,
      secret: secret!,
      cluster: cluster!,
      useTLS: true,
    });

    return this.pusher;
  }

  async trigger(channel: string, event: string, data: unknown) {
    return this.getClient().trigger(channel, event, data);
  }

  authorizeChannel(socketId: string, channel: string) {
    if (!socketId?.trim() || !channel?.trim()) {
      throw new BadRequestException(
        'Pusher auth requires socket_id and channel_name',
      );
    }

    return this.getClient().authorizeChannel(socketId.trim(), channel.trim());
  }
}
