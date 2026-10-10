import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { isTrustedMutation } from "@/server/security/request-origin";

export function proxy(request: NextRequest) {
  if (!isTrustedMutation(request)) {
    return jsonError(403, "Запрос с другого сайта запрещён. Обновите страницу и повторите действие.", undefined,
      { headers: { "Cache-Control": "no-store", Vary: "Origin, Sec-Fetch-Site" } });
  }
  return NextResponse.next();
}

// No DB reads here. New API mutations inherit this gate automatically.
export const config = { matcher: "/api/:path*" };
