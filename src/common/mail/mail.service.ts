import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

export type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Sends email via mail-bridge POST /send-email (multipart/form-data).
   * to_email must be appended as separate rows with the same key (not comma-separated).
   */
  async sendEmail(
    toEmail: string | string[],
    subject: string,
    bodyHtml: string,
    fromEmail: string,
    options?: {
      masterUser?: string;
      attachments?: MailAttachment[];
    },
  ) {
    const url = process.env.MAIL_SERVICE_URL;
    const apiKey = process.env.MAIL_API_KEY;

    if (!url) {
      throw new BadRequestException('MAIL_SERVICE_URL is not configured');
    }
    if (!apiKey) {
      throw new BadRequestException('MAIL_API_KEY is not configured');
    }
    if (!fromEmail?.trim()) {
      throw new BadRequestException('from_email is required');
    }
    if (!subject?.trim()) {
      throw new BadRequestException('subject is required');
    }
    if (!bodyHtml?.trim()) {
      throw new BadRequestException('body_html is required');
    }

    const recipients = (Array.isArray(toEmail) ? toEmail : [toEmail])
      .map((email) => email?.trim())
      .filter((email): email is string => Boolean(email));

    if (!recipients.length) {
      throw new BadRequestException('At least one to_email is required');
    }

    const formData = new FormData();
    formData.append('from_email', fromEmail.trim());

    // Same key repeated once per recipient (mail-bridge requirement)
    for (const email of recipients) {
      formData.append('to_email', email);
    }

    formData.append('subject', subject.trim());
    formData.append('body_html', bodyHtml);

    const masterUser =
      options?.masterUser ?? process.env.MAIL_SERVICE_MASTER_USER;
    if (masterUser?.trim()) {
      formData.append('master_user', masterUser.trim());
    }

    for (const attachment of options?.attachments ?? []) {
      const buffer = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content);
      formData.append('attachments', buffer, {
        filename: attachment.filename,
        contentType: attachment.contentType,
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            'x-api-key': apiKey,
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${recipients.join(', ')}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private renderTemplate(templateName: string, data: Record<string, any>) {
    const filePath = path.join(
      process.cwd(),
      'src/common/mail/templates',
      `${templateName}.hbs`,
    );
    const source = fs.readFileSync(filePath, 'utf8');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderVerifyEmailTemplate(data: {
    logoUrl: string;
    name: string;
    otp: string;
    year: number;
  }) {
    return this.renderTemplate('verify-email', data);
  }

  renderResetPasswordTemplate(data: {
    logoUrl: string;
    name: string;
    otp: string;
    year: number;
  }) {
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

  renderResetPinTemplate(data: {
    logoUrl: string;
    name: string;
    resetUrl: string;
    year: number;
  }) {
    return this.renderTemplate('reset-pin-email', data);
  }
}
