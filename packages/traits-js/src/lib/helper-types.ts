export type OrEmptyObj<T> = T extends EmptyObject ? EmptyObject : T;

export type Instance<T> = T extends new (...args: any[]) => infer I ? I : T;
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type Normalize<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};


/** Any object such as `{}` */
export type EmptyObject = Record<PropertyKey, never>;

export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export type This<T> = ThisType<{
    readonly [P in keyof T]-?: T[P] & {};
}>;



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


export type RequiredKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? never : P]: T[P];
};