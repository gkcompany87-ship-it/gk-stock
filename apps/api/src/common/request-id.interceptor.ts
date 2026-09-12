import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { nanoid } from "nanoid";
import { Observable } from "rxjs";
import type { FastifyReply, FastifyRequest } from "fastify";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { requestId?: string }>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const incoming = request.headers["x-request-id"];
    const requestId = Array.isArray(incoming) ? incoming[0] : incoming;
    request.requestId = requestId ?? nanoid(12);
    reply.header("x-request-id", request.requestId);
    return next.handle();
  }
}
