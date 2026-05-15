import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { PlatformUser } from '../master-db/entities/platform-user.entity';
import { MailService } from 'src/common/mail/mail.service';
import { Customer } from 'src/master-db/entities/customer.entity';
import { RegisterCustomerDto } from './dto/customer/register-customer.dto';
import { LoginCustomerDto } from './dto/customer/login-customer.dto';
import { UpdateCustomerDto } from './dto/customer/update-customer.dto';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { PusherService } from 'src/common/pusher/pusher.service';
@Injectable()
export class AuthService {

    constructor(
        @InjectRepository(PlatformUser)
        private readonly userRepo: Repository<PlatformUser>,
        private readonly jwt: JwtService,

        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,  // Inject the Customer repository
        private readonly mailService: MailService,

        @InjectRepository(PlatformRole)
        private readonly platformRoleRepo: Repository<PlatformRole>,
        private readonly pusherService: PusherService,
    ) { }

    async validateUser(email: string, password: string) {
        const user = await this.userRepo.findOne({ where: { email }, relations: ['role'], });
        if (!user || !user.isActive) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return user;
    }

    async signin(email: string, password: string) {
        const user = await this.validateUser(email, password);

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role.code,
        };

        delete user.passwordHash;

        return {
            access_token: this.jwt.sign(payload),
            user: user,
            // role: role
        };
    }



    // customer related methods can be added here in the future



    // Registration Logic
    async registerCustomer(createCustomerDto: RegisterCustomerDto) {
        const existing = await this.customerRepo.findOne({ where: { email: createCustomerDto.email } });
        if (existing) {
            throw new BadRequestException('Email already registered');
        }

        const customer = await this.customerRepo.save(
            this.customerRepo.create({
                fullName: createCustomerDto.fullName,
                email: createCustomerDto.email,
                phone: createCustomerDto.phone,
                country: createCustomerDto.country,
                passwordHash: await bcrypt.hash(createCustomerDto.passwordHash, 10),
            }),
        );

        // Save customer to DB using repository's save method
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3) store hashed otp + expiry (10 minutes)
        customer.email_verification_otp = otp;
        customer.email_verification_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
        await this.customerRepo.save(customer);

        // send verification email logic here (not implemented in this snippet)
        const logoUrl = process.env.APP_LOGO_URL || 'https://snd.com/logo.png';
        const bodyHtml = this.mailService.renderVerifyEmailTemplate({
            logoUrl,
            name: customer.fullName,
            otp,
            year: new Date().getFullYear(),
        });

        // 5) send email
        const res = await this.mailService.sendEmail(
            customer.email,
            'Verification Email - Salevince Customer Account',
            bodyHtml,
            'noreply@salesvince.com',
        );

        return {
            id: customer.id,
            email: customer.email,
            fullName: customer.fullName,
            phone: customer.phone,
            country: customer.country,
            emailVerified: !!customer.email_verified_at,
            message: 'Account has been created. check your email for verification.',
        };

    }

    //  Verify Email
    async verifyCustomerEmail(code: string) {
        const customer = await this.customerRepo.findOne({
            where: { email_verification_otp: code },
        });

        if (!customer) {
            throw new BadRequestException('Invalid verification code');
        }
        if (customer.email_verification_otp_expires_at < new Date()) {
            throw new BadRequestException('Verification code has expired');
        }
        if (customer.email_verified_at) {
            throw new BadRequestException('Email already verified');
        }

        // Update email_verified_at to the current timestamp
        customer.email_verified_at = new Date();  // Set current timestamp

        // Clear email_verification_otp and email_verification_otp_expires_at
        customer.email_verification_otp = '';

        return await this.customerRepo.save(customer);  // Save the updated customer
    }

    // Resend Verification Email
    async resendVerificationEmail(email: string) {
        const customer = await this.customerRepo.findOne({
            where: { email },
        });

        if (!customer) {
            throw new BadRequestException('Customer not found');
        }

        if (customer.email_verified_at) {
            throw new BadRequestException('Email already verified');
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3) store hashed otp + expiry (10 minutes)
        customer.email_verification_otp = otp;
        customer.email_verification_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
        await this.customerRepo.save(customer);

        // send verification email logic here (not implemented in this snippet)
        const logoUrl = process.env.APP_LOGO_URL || 'https://snd.com/logo.png';
        const bodyHtml = this.mailService.renderVerifyEmailTemplate({
            logoUrl,
            name: customer.fullName,
            otp,
            year: new Date().getFullYear(),
        });

        // 5) send email
        const res = await this.mailService.sendEmail(
            customer.email,
            'Verification Email - Salevince Customer Account',
            bodyHtml,
            'noreply@salesvince.com',
        );

        return {
            id: customer.id,
            email: customer.email,
            fullName: customer.fullName,
            phone: customer.phone,
            country: customer.country,
            emailVerified: !!customer.email_verified_at,
            message: 'Verification email has been resent. check your email for verification.',
        };
    }

    // Login Logic
    async loginCustomer(loginCustomerDto: LoginCustomerDto) {
        const customer = await this.customerRepo.findOne({
            where: { email: loginCustomerDto.email },
        });

        if (!customer || !(await bcrypt.compare(loginCustomerDto.passwordHash, customer.passwordHash))) {
            throw new Error('Invalid credentials');
        }
        if (!customer.email_verified_at) {
            throw new BadRequestException('Email not verified');
        }
        const payload = {
            sub: customer.id,
            email: customer.email,
            type: 'customer',
        };

        const token = this.jwt.sign(payload, {
            secret: process.env.CUSTOMER_JWT_SECRET,
            expiresIn: '7d',
        });
        delete customer.passwordHash; // Remove password hash before returning customer data
        // Generate and return JWT token
        return { message: 'Login successful', customer, token };
    }

    // Update Logic
    async updateCustomer(updateCustomerDto: UpdateCustomerDto) {
        const customer = await this.customerRepo.findOne({
            where: { email: updateCustomerDto.email },
        });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Update customer data
        customer.fullName = updateCustomerDto.fullName || customer.fullName;
        customer.phone = updateCustomerDto.phone || customer.phone;
        customer.country = updateCustomerDto.country || customer.country;

        // Save updated data using repository's save method
        return await this.customerRepo.save(customer);
    }


    // Pusher Authentication
    async triggerEvent(channel: string, event: string, data: any) {
        await this.pusherService.trigger(channel, event, data);
    }
}
