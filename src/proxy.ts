import { NextResponse, type NextRequest } from "next/server";
import { updateSession, type CookieOptions, type CookieStore } from "@insforge/sdk/ssr/middleware";
import { SESSION_COOKIE } from "@/lib/auth/constants";

function requestCookieStore(request: NextRequest): CookieStore {
  return { get: (name) => request.cookies.get(name) };
}

function responseCookieStore(response: NextResponse): CookieStore {
  return {
    get: (name) => response.cookies.get(name),
    set: (nameOrOptions: string | ({ name: string; value: string } & CookieOptions), value?: string, options?: CookieOptions) => {
      if (typeof nameOrOptions === "string") {
        response.cookies.set({ name: nameOrOptions, value: value ?? "", ...(options ?? {}) });
      } else {
        response.cookies.set(nameOrOptions);
      }
    },
    delete: (nameOrOptions: string | ({ name: string } & Record<string, unknown>)) => {
      response.cookies.delete(typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name);
    },
  } as CookieStore;
}

function shouldUseInsForgeAuth() {
  if (process.env.DATA_BACKEND === "sqlite") return false;
  if (process.env.DATA_BACKEND === "insforge") return true;
  if (process.env.NEXT_PUBLIC_INSFORGE_URL && process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY) return true;
  return process.env.APP_MODE === "production" || process.env.NODE_ENV === "production";
}

export async function proxy(request: NextRequest) {
  if (shouldUseInsForgeAuth()) {
    const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
    const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
    if (!baseUrl || !anonKey) {
      return NextResponse.json({ error: "Authentication backend is not configured." }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const response = NextResponse.next({ request });
    const result = await updateSession({
      requestCookies: requestCookieStore(request),
      responseCookies: responseCookieStore(response),
      baseUrl,
      anonKey,
    });
    if (!result.accessToken) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", request.nextUrl.pathname);
      const redirect = NextResponse.redirect(login);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
    return response;
  }
  if (!request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/prospecting/:path*", "/pipeline/:path*", "/inbox/:path*", "/businesses/:path*", "/campaigns/:path*", "/build-studio/:path*", "/runs/:path*", "/integrations/:path*", "/settings/:path*", "/local-call/:path*", "/denied"],
};
