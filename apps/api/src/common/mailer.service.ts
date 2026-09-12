import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly transport;
  constructor(private readonly config: ConfigService) {
    const user = config.get<string>("SMTP_USER");
    this.transport = nodemailer.createTransport({ host: config.getOrThrow<string>("SMTP_HOST"), port: Number(config.get("SMTP_PORT", 1025)),
      secure: config.get("SMTP_SECURE") === "true", requireTLS: config.get("SMTP_REQUIRE_TLS") === "true",
      auth: user ? { user, pass: config.getOrThrow<string>("SMTP_PASSWORD") } : undefined,
      connectionTimeout: 5000, socketTimeout: 15_000, tls: { minVersion: "TLSv1.2" } });
  }
  async send(to: string, subject: string, text: string, attachment?: { filename: string; content: Buffer }, messageId?: string) {
    return this.transport.sendMail({ from: this.config.getOrThrow<string>("SMTP_FROM"), to, subject, text,
      attachments: attachment ? [attachment] : undefined, messageId });
  }
  onModuleDestroy() { this.transport.close(); }
}
