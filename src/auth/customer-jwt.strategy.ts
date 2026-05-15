import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from 'src/master-db/entities/customer.entity';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(
    Strategy,
    'customer-jwt',
) {
    constructor(
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.CUSTOMER_JWT_SECRET!,
        });
    }

    async validate(payload: any) {
        if (payload.type !== 'customer') {
            throw new UnauthorizedException();
        }

        return payload;
    }
}
