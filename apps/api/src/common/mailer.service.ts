import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly transport: ReturnType<typeof nodemailer.createTransport> | null;
  private readonly from: string | null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>("SMTP_HOST")?.trim();
    const from = config.get<string>("SMTP_FROM")?.trim();

    this.from = from || null;

    // Email is optional. If SMTP isn't configured, the rest of the
    // application continues to work normally.
    if (!host || !from) {
      this.transport = null;
      return;
    }

    const user = config.get<string>("SMTP_USER")?.trim();

    this.transport = nodemailer.createTransport({
      host,
      port: Number(config.get("SMTP_PORT", 587)),
      secure: config.get("SMTP_SECURE") === "true",
      requireTLS: config.get("SMTP_REQUIRE_TLS") === "true",
      auth: user
        ? {
            user,
            pass: config.getOrThrow<string>("SMTP_PASSWORD")
          }
        : undefined,
      connectionTimeout: 5000,
      socketTimeout: 15_000,
      tls: {
        minVersion: "TLSv1.2"
      }
    });
  }

  async send(
    to: string,
    subject: string,
    text: string,
    attachment?: {
      filename: string;
      content: Buffer;
    },
    messageId?: string
  ) {
    if (!this.transport || !this.from) {
      throw new ServiceUnavailableException(
        "L'envoi d'e-mails n'est pas configuré sur cette installation."
      );
    }

    return this.transport.sendMail({
      from: this.from,
      to,
      subject,
      text,
      attachments: attachment ? [attachment] : undefined,
      messageId
    });
  }

  onModuleDestroy() {
    this.transport?.close();
  }
}
