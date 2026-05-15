import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { InvoiceService } from '../services/invoice.service';
import { CreateInvoicePaymentDto } from '../dto/invoice/create-invoice-payment.dto';

@Controller('platform/invoice')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('/')
  async getInvoices(@Query('page') page: number = 1, @Query('limit') limit: number = 10, @Req() req: any) {
    return this.invoiceService.getInvoices(page, limit, req.user);
  }

  @Get('/:id')
  async getInvoiceById(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.invoiceService.getInvoiceById(id, req.user);
  }

  @Post('/:id/payment')
  async createInvoicePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInvoicePaymentDto,
    @Req() req: any,
  ) {
    return this.invoiceService.createInvoicePayment(id, dto, req.user);
  }
}
