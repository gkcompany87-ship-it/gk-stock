import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createApplication } from "./bootstrap.js";
async function main() {
 const app=await createApplication();const config=app.get(ConfigService);
 await app.listen({host:config.get("API_HOST","0.0.0.0"),port:Number(config.get("API_PORT",4000))});
 new Logger("Bootstrap").log("G&K Stock API ready at /api/v1");
}
main().catch(error=>{console.error("API startup failed:",error instanceof Error?error.message:"configuration error");process.exitCode=1;});
