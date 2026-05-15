import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

@Injectable()
export class MailService {
    constructor(private readonly httpService: HttpService) { }

    async sendEmail(
        toEmail: string,
        subject: string,
        bodyHtml: string,
        fromEmail: string,
    ) {
        const url = process.env.MAIL_SERVICE_URL;
        const masterUser = process.env.MAIL_SERVICE_MASTER_USER;

        const formData = new FormData();

        formData.append('master_user', masterUser);
        formData.append('from_email', fromEmail);
        formData.append('to_email', toEmail);
        formData.append('subject', subject);
        formData.append('body_html', bodyHtml);


        const response = await firstValueFrom(
            this.httpService.post(url!, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'x-api-key': process.env.MAIL_API_KEY!,
                },
            }),
        );
        // console.log('Email-send response:', response.data);
        // return response.data;
    }

    private renderTemplate(templateName: string, data: Record<string, any>) {
        const filePath = path.join(process.cwd(), 'src/common/mail/templates', `${templateName}.hbs`);
        const source = fs.readFileSync(filePath, 'utf8');
        const template = Handlebars.compile(source);
        return template(data);
    }

    renderVerifyEmailTemplate(data: { logoUrl: string; name: string; otp: string; year: number }) {
        return this.renderTemplate('verify-email', data);
    }

    renderResetPasswordTemplate(data: { logoUrl: string; name: string; otp: string; year: number }) {
        return this.renderTemplate('reset-password-email', data);
    }

    renderTenantUserInviteTemplate(data: {
        logoUrl: string;
        invitedByName: string;
        tenantName: string;
        setupUrl: string;
        year: number;
    }) {
        return this.renderTemplate('tenant-user-invite', data);
    }
}