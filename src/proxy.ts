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

export async function proxy(request: NextRequest) {
  if (process.env.DATA_BACKEND === "insforge") {
    const response = NextResponse.next({ request });
    const result = await updateSession({
      requestCookies: requestCookieStore(request),
      responseCookies: responseCookieStore(response),
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
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
  matcher: ["/", "/prospecting/:path*", "/pipeline/:path*", "/businesses/:path*", "/campaigns/:path*", "/build-studio/:path*", "/runs/:path*", "/integrations/:path*", "/settings/:path*", "/denied"],
};
