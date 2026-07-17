// next/image does not auto-prepend basePath onto `src`; do it ourselves so the
// static-export GitHub Pages build (basePath: "/RepLift") resolves assets.
// Must be NEXT_PUBLIC_-prefixed: consumers are bundled into client code, and
// only NEXT_PUBLIC_ vars are inlined into the client bundle.
export const BASE_PATH = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1" ? "/RepLift" : "";

export function withBasePath(path: string): string {
  return BASE_PATH + (path.startsWith("/") ? path : `/${path}`);
}
