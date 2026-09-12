import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>(); const req = host.switchToHttp().getRequest<FastifyRequest>();
    let status = 500; let message = "Erreur interne. Contactez un administrateur avec l'identifiant de requete.";
    let details: unknown;
    if (error instanceof ZodError) { status = 400; message = "Donnees invalides."; details = error.issues.map(i => ({ path: i.path.join("."), message: i.message })); }
    else if (error instanceof HttpException) { status = error.getStatus(); const response = error.getResponse(); message = typeof response === "string" ? response : error.message; }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") { status = 409; message = "Une valeur unique existe deja."; }
      else if (error.code === "P2025") { status = 404; message = "Element introuvable."; }
      else if (["P2003", "P2004", "P2010", "P2034"].includes(error.code)) { status = 409; message = "Operation refusee par une contrainte ou un conflit. Actualisez puis reessayez."; }
    } else if (error instanceof RangeError || error instanceof TypeError && /decimal|monetary|quantity/i.test(error.message)) { status = 400; message = error.message; }
    if (status === 500) this.logger.error({ requestId: req.id, name: error instanceof Error ? error.name : "UnknownError" }, "Unhandled request error");
    reply.status(status).send({ error: { status, code: `HTTP_${status}`, message, details, requestId: req.id }, requestId: req.id });
  }
}
