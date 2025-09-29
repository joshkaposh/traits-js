import { trait } from './define';
import { include, instance } from './modifier';

type MethodRecord = Record<string, (...args: any[]) => any>;

type ConstKey = Uppercase<string>;
type ConstType = string | boolean | number | bigint | symbol;
type ConstRecord = Readonly<Record<ConstKey, ConstType>>;

export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export interface TraitRecord extends ConstRecord {
    [instance]?: MethodRecord;
};

export type Type<T extends TraitRecord = {}> = T;

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
export type TraitClass<Tclass, Ttype extends Array<TraitRecord>> = Merge<Tclass, Ttype>;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

type DefaultInstanceMethods<T> = T extends { [instance]: infer I } ? ({
    [instance]: (DefaultMethods<I> & {
        [include]?: IncludeRecord<I>;
    }) & ThisType<Prettify<Normalize<I>>>;
}) : {};

// type DefaultInstanceMethodsActual<T> = {
//     [instance]: (DefaultInstanceMethods<T>) & ThisType<Prettify<Normalize<T>>>;
// };

// type DefaultInstanceMethods3<T> = DefaultKeysOf<PickInstance<T>> extends never ? {} : {
//     [instance]: DefaultInstanceMethods<PickInstance<T>>
// } & DefaultMethods<T>


// type HasInstance<T> = DefaultKeysOf<T> extends never ? true : false;

// type DefTest = Prettify<HasInstance<{
//     [instance]: {
//         foo(): void;
//     }
// }>>;

// type IsEmpty<T> = keyof T extends never ? 1 : 0;
// type True = IsEmpty<{}>;

const FooTrait = trait<{
    foo(): void;
    [instance]: {
        foo(): void;
    }
}>({
    [instance]: {}
});


// type DefaultInstanceMethodsActual<T> = {
//     [instance]: (DefaultMethods<T> & {
//         [include]?: IncludeRecord<T>;
//     }) & ThisType<Prettify<Normalize<T>>>;
// };

// type DefaultInstanceMethods2<T extends TraitRecord> = PickInstance<T> extends MethodRecord ? DefaultInstanceMethodsActual<PickInstance<T>> : {}

export type Trait<T extends TraitRecord = {}> = (DefaultInstanceMethods<T> & DefaultMethods<T>) & ThisType<Normalize<T>>;


export type Derive<Base extends Trait[] = [], T extends Trait = {}> = MergeProps<Base> & T;

export type AddDerives<Tclass, Ttype extends Array<DeriveFn>> = TraitClass<Tclass, InferTypes<Ttype>>;

export type DeriveFnNew<T extends TraitRecord> = <const Ttrait extends Trait<T>>(trait: Ttrait) => Ttrait;

export type DeriveFn<T extends TraitRecord = {}> = <const C extends ValidClass>(target: C) => TraitClass<C, [T]>;
export type ImplFn<T extends TraitRecord = {}> = ((implementation: T) => DeriveFn<T extends TraitRecord ? T : never>);

export type Impl<T extends TraitRecord = {}> = (implementation: T) => any;

export type InferTypes<Derives extends any[], Converted extends any[] = []> = Derives extends [infer T, ...infer Rest extends any[]] ? InferTypes<Rest, [...Converted,
    T extends DeriveFn<infer Type> ? Type :
    T extends ImplFn<infer Type> ? Type :
    T extends TraitRecord ? T
    : never
]> : Converted;

export type ClassFromTraits<Traits extends any[]> = (new () => Required<MergeProps<InferInstanceTypes<Traits>>>) & MergeProps<PickStaticTypes<Traits>>;


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

type Defaults<T> = {
    [P in DefaultKeysOf<T> as T[P] extends ((...args: any[]) => any) | undefined ? P : never]: T[P];
};

type DefaultMethods<T> = Prettify<Normalize<Defaults<T>>>;
type Normalize<T> = { readonly [K in keyof T]-?: T[K] };

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
type RequiredKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? never : P]: T[K];

};

type RequiredMethods<T> = Pick<T, RequiredKeysOf<T>>;

type PickInstance<T> = T extends { [instance]?: MethodRecord } ? T[instance] : never;


type FooTest = { foo(): void; dFoo?(): void };

declare const FooReq: RequiredMethods<FooTest> & Partial<DefaultMethods<Partial<FooTest>>>;
// FooReq.dFoo();
// FooReq.foo()

export type Implementation<T extends Type> = RequiredMethods<T>;

type InferInstanceTypes<Derives extends any[], Converted extends any[] = []> = Derives extends [infer T, ...infer Rest extends any[]] ? InferTypes<Rest, [...Converted, T extends DeriveFn<infer Type> ? PickInstance<Type> : T extends TraitRecord ? PickInstance<T> : never]> : Converted;
type PickStaticTypes<Derives extends any[], Converted extends any[] = []> = Derives extends [infer T, ...infer Rest extends any[]] ? InferTypes<Rest, [...Converted, T extends DeriveFn<infer Type> ? { readonly [K in Exclude<keyof Type, instance>]-?: NonNullable<Type[K]> } : T extends TraitRecord ? { readonly [K in Exclude<keyof T, instance>]-?: T[K] } : never]> : Converted;

type MergeProps<Ttype extends any[], Props = {}> = Ttype extends [infer Tcurrent extends TraitRecord, ...infer Trest extends Array<any>] ? MergeProps<Trest, Props & Tcurrent> : Props;

type Merge<Tclass, Ttypes extends any[]> = Tclass extends (new (...args: infer Args) => infer Instance extends object) & infer Static extends object ? (
    new (...args: Args) => Instance & Required<MergeProps<InferInstanceTypes<Ttypes>>>
) & Static & MergeProps<PickStaticTypes<Ttypes>>
    : never;