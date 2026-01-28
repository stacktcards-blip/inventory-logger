declare module '@supabase/supabase-js' {
  export const createClient: (...args: any[]) => any;
}

declare module 'express' {
  const exp: any;
  export const Router: () => any;
  export default exp;
}

declare namespace express {
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
}

declare module 'googleapis' {
  export namespace gmail_v1 {
    type Schema$Message = any;
    type Schema$MessagePart = any;
  }
  export const google: any;
}

declare module 'pino' {
  const pino: any;
  export default pino;
}

declare module 'zod' {
  export const z: any;
}

declare module 'crypto' {
  const crypto: any;
  export default crypto;
  export const createHash: (...args: any[]) => any;
}

declare var process: {
  env: Record<string, string | undefined>;
};

declare class Buffer {
  static from(data: string, encoding: string): Buffer;
  toString(encoding: string): string;
}
