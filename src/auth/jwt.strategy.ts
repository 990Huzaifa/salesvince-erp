import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        config: ConfigService,
        @InjectRepository(PlatformUser)
        private readonly platformUserRepo: Repository<PlatformUser>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET!,
        });
    }

    async validate(payload: any) {
        const user = await this.platformUserRepo.findOne({
            where: { id: payload.sub },
            relations: ['role', 'role.permissions'], // VERY IMPORTANT
        });

        if (!user) {
            throw new UnauthorizedException();
        }

        return user;
    }
}
