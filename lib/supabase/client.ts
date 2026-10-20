import { createClient } from "@supabase/supabase-js";
import { createCachedSupabaseFetch } from "@/lib/read-model/supabase-fetch";

// D3 (2026-10-20): client service đọc qua đệm có phiên bản (lib/read-model/supabase-fetch.ts) — giữ hạn mức egress miễn phí
// của tổ chức Supabase; kết quả giống hệt đọc thẳng.
const cachedFetch = createCachedSupabaseFetch((...args) => fetch(...args));

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: cachedFetch } }
  );
}

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
