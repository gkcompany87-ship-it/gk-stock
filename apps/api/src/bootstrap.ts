import "reflect-metadata";
import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { enrichOpenApi } from "./openapi.js";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { requestContext } from "./common/request-context.js";
export async function createApplication(options: { logging?: boolean; shutdownHooks?: boolean } = {}): Promise<NestFastifyApplication> {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) throw new Error("TRUST_PROXY_HOPS must be 0, 1 or 2.");
  const trustProxy = hops === 0
    ? false
    : (_address: string, hop: number) => hop < hops;
  const adapter = new FastifyAdapter({
    logger: false,
    trustProxy,
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
    requestTimeout: 30_000
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: true });
  app.useLogger(options.logging === false ? false : app.get(Logger));
  const config = app.get(ConfigService);
  const production = config.get("NODE_ENV") === "production";
  for (const key of ["COOKIE_SECRET", "ACCESS_TOKEN_SECRET"]) {
    if (config.getOrThrow<string>(key).length < 43) throw new Error(`${key} must contain at least 32 random bytes encoded as base64url.`);
  }
  const allowedOrigins = config.getOrThrow<string>("API_ALLOWED_ORIGINS").split(",").map(o => o.trim());
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || production && parsed.protocol !== "https:") throw new Error("Invalid API_ALLOWED_ORIGINS; production requires HTTPS origins.");
  }
  adapter.getInstance().addHook("onRequest", (req, reply, done) => {
    reply.header("X-Request-ID", req.id).header("Cache-Control", "no-store");
    requestContext.run({ requestId: req.id, ipAddress: req.ip }, done);
  });
  await app.register(fastifyCookie as unknown as Parameters<typeof app.register>[0], { secret: config.getOrThrow<string>("COOKIE_SECRET") });
  await app.register(fastifyHelmet as unknown as Parameters<typeof app.register>[0], { contentSecurityPolicy: false, referrerPolicy: { policy: "no-referrer" } });
  await app.register(fastifyCors as unknown as Parameters<typeof app.register>[0], { origin: allowedOrigins, credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key"], exposedHeaders: ["X-Request-ID", "Content-Disposition"] });
  await app.register(fastifyMultipart as unknown as Parameters<typeof app.register>[0], { limits: { files: 1, fileSize: 2 * 1024 * 1024, fields: 1, parts: 2 } });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  if (options.shutdownHooks !== false) app.enableShutdownHooks();
  if (!production && config.get("SWAGGER_ENABLED") === "true") {
    const builder = new DocumentBuilder().setTitle("G&K Stock API").setVersion("1.0")
      .setDescription("Cookie authentication. Obtain X-CSRF-Token from GET /auth/csrf before every mutation. Critical writes require Idempotency-Key. See docs/api.md.")
      .addCookieAuth(production ? "__Host-as_tino_access" : "as_tino_access")
      .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf").build();
    SwaggerModule.setup("api/docs", app, enrichOpenApi(SwaggerModule.createDocument(app, builder)));
  }
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
