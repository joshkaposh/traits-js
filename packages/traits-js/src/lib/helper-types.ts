/**
 * Extracts the "default keys" (names of default methods defined in `T`) from trait `T`.
 * 
 * These methods are implemented by _default_.
 * 
 * You may override them with a custom implementation
 * with the same __method signature__ as described by the trait.
 */
export type DefaultKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? P : never]: T[P];
};

/** Any object such as `{}` */
export type EmptyObject = Record<PropertyKey, never>;


export type ValidClass<A extends any[] = never, I extends object = object> = new (...args: A) => I;

export type This<T> = ThisType<{
    readonly [P in keyof T]-?: T[P] & {};
}>;
