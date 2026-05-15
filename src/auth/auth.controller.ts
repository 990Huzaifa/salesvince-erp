import { Controller, Get, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentPlatformUser } from './current-platform-user.decorator';
import { SigninDto } from './dto/user/signin.dto';
import { RegisterCustomerDto } from './dto/customer/register-customer.dto';
import { LoginCustomerDto } from './dto/customer/login-customer.dto';
import { UpdateCustomerDto } from './dto/customer/update-customer.dto';
import { PusherService } from 'src/common/pusher/pusher.service';

@Controller('platform/')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly pusherService: PusherService,
  ) { }

  @Post('auth/signin')
  signin(@Body() dto: SigninDto) {
    return this.authService.signin(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentPlatformUser() user: any) {
    delete user.passwordHash;
    await this.pusherService.trigger(
      `private-platform-user-${user.id}`,
      'notification.new',
      {
        message: 'Hello, world! by pusher',
      }
    );
    return user;
  }


  // Routs for customer

  @Post('customer/signup')
  async signUp(@Body() createCustomerDto: RegisterCustomerDto) {
    return this.authService.registerCustomer(createCustomerDto);
  }

  // Email Verification Route
  @Post('customer/verify-email')
  async verifyEmail(@Body('code') code: string) {
    return this.authService.verifyCustomerEmail(code);
  }

  // resend verification email
  @Post('customer/resend-verification-email')
  async resendVerificationEmail(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  // Login Route
  @Post('customer/login')
  async login(@Body() loginCustomerDto: LoginCustomerDto) {
    return this.authService.loginCustomer(loginCustomerDto);
  }

  // Update Route (for customer profile updates)
  @Post('customer/update')
  async update(@Body() updateCustomerDto: UpdateCustomerDto) {
    return this.authService.updateCustomer(updateCustomerDto);
  }



  // for pusher authentication
  @UseGuards(JwtAuthGuard)
  @Post('pusher/auth')
  async auth(@Req() req: any, @Res() res: any,@CurrentPlatformUser() user: any) {
    const socketId = (req.body as any).socket_id;
    const channel = (req.body as any).channel_name;

    // Platform user from JWT

    // Optional: restrict channels
    if (!channel.includes(`private-platform-user-${user.id}`)) {
      return res.status(403).json({ message: 'Unauthorized'});
    }

    const auth = this.pusherService.authorizeChannel(socketId, channel);
    return res.status(200).json(auth);
  }
}
