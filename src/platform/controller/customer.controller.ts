import { Controller, Post, Body, Get, Query, Param, Req } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';

@Controller('platform/customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @Get('/')
    async getCustomers(@Query('page') page: number, @Query('limit') limit: number, @Req() req: any) {
        return this.customerService.getCustomers(page, limit, req.user);
    }

    @Get('/:id')
    async showCustomer(@Param('id') id: string, @Req() req: any) {
        return this.customerService.showCustomer(id, req.user);
    }
}
