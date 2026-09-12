import { Global, Module } from "@nestjs/common";
import { MutationService } from "./mutation.service.js";
import { RedisService } from "./redis.service.js";
import { MailerService } from "./mailer.service.js";
@Global()
@Module({ providers: [MutationService, RedisService, MailerService], exports: [MutationService, RedisService, MailerService] })
export class CoreModule {}
