import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "@upstash/redis";

@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      url: this.config.getOrThrow<string>("UPSTASH_REDIS_REST_URL"),
      token: this.config.getOrThrow<string>("UPSTASH_REDIS_REST_TOKEN")
    });
  }

  async ping(): Promise<string> {
    const result = await this.redis.ping();
    return String(result);
  }

  async limit(key: string, ttl: number): Promise<number> {
    const script = `
      local n = redis.call("INCR", KEYS[1])
      if n == 1 then
        redis.call("PEXPIRE", KEYS[1], ARGV[1])
      end
      return n
    `;

    const result = await this.redis.eval(
      script,
      [key],
      [String(ttl)]
    );

    return Number(result);
  }
}
