import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class TenantJwtAuthGuard extends AuthGuard('tenant-jwt') {}
