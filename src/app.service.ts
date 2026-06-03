import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'THIS IS Salesvince ERP from the platform backend';
  }
}
