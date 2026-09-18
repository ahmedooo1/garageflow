import { config } from "dotenv";
import { beforeEach } from "vitest";
import { resetRateLimits } from "@/server/lib/rate-limit";

config({ path: ".env.test", override: true });

beforeEach(() => {
  resetRateLimits();
});
