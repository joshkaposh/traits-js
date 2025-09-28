import { include, instance } from './modifier';

export type MethodRecord = Record<string, (...args: any[]) => any>;
export type ConstKey = Uppercase<string>;
export type ConstType = string | boolean | number | bigint | symbol;
export type ConstRecord = Readonly<Record<ConstKey, ConstType>>;
export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

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

type IncludeRecord<T> = Partial<Record<DefaultKeysOf<T>, unknown[]>>

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
export type ImplObject<T extends object> = ({ [include]?: IncludeRecord<T> } & (T extends { [instance]?: infer I extends Partial<MethodRecord> } ? {
    [instance]: DefaultMethods<I> & {
        [include]?: IncludeRecord<I>;
    };
} : {}) & DefaultMethods<T> & ThisType<Normalize<T>>);

export type Derive<Base extends any[], T extends object> = MergeProps<Base> & T;

export type AddDerives<Tclass, Ttype extends Array<DeriveFn>> = Trait<Tclass, InferTypes<Ttype>>;
export type DeriveFn<T extends object = {}> = <const C extends ValidClass>(target: C) => Trait<C, [T]>;
export type ImplFn<T extends object = {}> = ((implementation: T) => DeriveFn<T>);
export type InferTypes<Derives extends any[], Converted extends any[] = []> = Derives extends [infer T, ...infer Rest extends any[]] ? InferTypes<Rest, [...Converted, T extends DeriveFn<infer Type> ? Type : T extends TraitRecord ? T : never]> : Converted;

type Defaults<T> = {
    [P in DefaultKeysOf<T> as T[P] extends ((...args: any[]) => any) | undefined ? P : never]: T[P];
};

type DefaultMethods<T> = Normalize<Defaults<T>>;
type Normalize<T> = { [K in keyof T]-?: T[K] } & {};

/**
 * Extracts the "default keys" (names of default methods defined in `T`) from trait `T`.
 * 
 * These methods are implemented by _default_.
 * 
 * You may override them with a custom implementation
 * with the same __method signature__ as described by the trait.
 */
type DefaultKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? P : never]: T[K];
};

// type InstanceKeysOf<T> = T extends {[instance]?: infer I extends Partial<MethodRecord>} ? I : never;

// type MyObj = {
//     s(): void;
//     [instance]: {
//         i(): void;
//     }
// };

// type Inst = InstanceKeysOf<MyObj>;

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

type MergeInstance<Instance, Ttypes extends any[]> = Instance & Normalize<PickInstance<MergeProps<Ttypes>>>;

type MergeStatic<Static, Ttypes extends any[]> = Static & Normalize<PickStatic<MergeProps<Ttypes>>>;

type Merge<Tclass, Ttypes extends any[]> = Tclass extends (new (...args: infer Args) => infer Instance extends object) & infer Static extends object ? (
    new (...args: Args) => MergeInstance<Instance, Ttypes>
) & MergeStatic<Static, Ttypes>
    : never;