import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonError(
  status: number,
  message: string,
  details?: unknown,
  init?: ResponseInit,
) {
  return NextResponse.json(
    { error: { message, details } },
    { status, ...init },
  );
}

