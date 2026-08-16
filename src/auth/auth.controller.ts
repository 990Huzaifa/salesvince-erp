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
  async auth(@Req() req: any, @Res() res: any, @CurrentPlatformUser() user: any) {
    const body = req.body ?? {};
    const socketId = body.socket_id ?? body.socketId;
    const channel = body.channel_name ?? body.channelName;

    if (!socketId?.trim() || !channel?.trim()) {
      return res.status(400).json({
        message: 'socket_id and channel_name are required',
      });
    }

    if (!channel.includes(`private-platform-user-${user.id}`)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
      const auth = this.pusherService.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Pusher authorization failed';
      return res.status(500).json({ message });
    }
  }
}
