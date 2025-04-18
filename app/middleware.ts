import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Force HTTPS in production
  if (process.env.NODE_ENV === "production" && !request.headers.get("x-forwarded-proto")?.includes("https")) {
    return NextResponse.redirect(`https://${request.headers.get("host")}${request.nextUrl.pathname}`, 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/:path*",
}

