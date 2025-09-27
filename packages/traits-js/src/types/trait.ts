export type MethodRecord = Record<string, (...args: any[]) => any>;
export type ConstKey = Uppercase<string>;
export type ConstType = string | boolean | number | bigint | symbol;
export type ConstRecord = Readonly<Record<ConstKey, ConstType>>;
export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export type instance = typeof instance;
export declare const instance: symbol;

export interface TraitRecord extends ConstRecord {
    [instance]?: MethodRecord;
};

/**
 * ### Usage
 * 
 * use on `ImplFn` to get the `trait` it implements (useful if other libraries don't expose their own types).
 */
export type Infer<T> = T extends ImplFn<infer Type> ? Type : never;

/**
 * ### Usage
 * 
 * Adds every `TraitRecord` (i.e _trait_) in `Ttype` to `Tclass`.
 */
export type Trait<Tclass, Ttype extends Array<object>> = Merge<Tclass, Ttype>;
/**
 * ### Usage
 * 
 * Gets the default method(s) for the specified trait `T`.
 * 
 * Similar to `Omit<T, RequiredKeysOf<T>>`
 * 
 * This should be used as a parameter type.
 * @example
 * ```typescript
 * type MyTrait = {
 *   default?(): void;
 *   required(): void;
 * };
 * // impl is now typed as Omit<MyTrait, 'required'>
 * declare function myFn(impl: Impl<MyTrait>):void
 * ```
 */
export type Impl<T extends object> = DefaultMethods<T> & ThisType<Normalize<T>>;
export type Derive<Base extends any[], T extends object> = MergeProps<Base> & T;

export type AddDerives<Tclass, Ttype extends Array<DeriveFn>> = Trait<Tclass, DerivesToTypes<Ttype>>;
export type DeriveFn<T extends object = {}> = <const C extends ValidClass>(target: C) => Trait<C, [T]>;
export type ImplFn<T extends object = {}> = ((implementation: T) => DeriveFn<T>);
export type DerivesToTypes<Derives extends any[], Converted extends any[] = []> = Derives extends [infer T, ...infer Rest extends any[]] ? DerivesToTypes<Rest, [...Converted, T extends DeriveFn<infer Type> ? Type : T extends TraitRecord ? T : never]> : Converted;

export type DefaultMethods<T> = Normalize<{
    [P in DefaultKeysOf<T> as T[P] extends ((...args: any[]) => any) | undefined ? P : never]: T[P];
}>;

type Normalize<T> = { [K in keyof T]-?: T[K] } & {};

/**
 * Extracts the "default keys" (names of default methods defined in `T`) from trait `T`.
 * 
 * These methods are implemented by _default_.
 * 
 * You may override them with a custom implementation
 * with the same __method signature__ as described by the trait.
 */
export type DefaultKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? P : never]: T[K];
};

/**
 * Extracts the "required keys" (names of required methods or constants defined in `T`) from trait `T`.
 * 
 * These constants and / or methods **MUST** be implemented when using trait `T`.
 */
export type RequiredKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? never : P]: T[K];
}

export type PickStatic<T> = T extends TraitRecord ? Omit<T, instance> : never;
export type PickInstance<T> = T extends { [instance]?: MethodRecord } ? T[instance] : never;

type MergeProps<Ttype extends any[], Props = {}> = Ttype extends [infer Tcurrent, ...infer Trest extends Array<any>] ? MergeProps<Trest, Props & Tcurrent> : Props;
type Merge<Tclass, Ttype extends any[]> = Tclass extends (new (...args: infer Args) => infer Instance extends object) & infer StaticProperties extends object ? (
    new (...args: Args) => Instance & Normalize<PickInstance<MergeProps<Ttype>>>
) & StaticProperties & Normalize<
    PickStatic<MergeProps<Ttype>>>
    : never;

// export type RequiredMethods<T extends object> = RequiredPickMethod<T, Exclude<keyof T, OptionalKeysOf<T>>>;
// export type StaticMethods<T> = RequiredPickMethod<T, Exclude<keyof T, InstanceKeysOf<T>>>;
// export type InstanceMethods<T> = RequiredPickMethod<T, InstanceKeysOf<T>>;