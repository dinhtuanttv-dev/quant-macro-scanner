import { Redis } from "@upstash/redis";
import "dotenv/config";
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
redis.get("catalyst:calibration").then((v) => console.log(JSON.stringify(v, null, 2)));
