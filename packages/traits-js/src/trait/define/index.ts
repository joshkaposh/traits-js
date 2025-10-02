import type { Derive, DeriveFn, ImplFn, MergeProps, TraitImplementation, TraitImplementation2, TraitRecord, ValidClass } from "../types";
// TODO: add list of advanced usage examples... after I implement them (Traits deriving other Traits, generic Traits)

type NormalizeDerives<D extends TraitRecord[], Base extends TraitRecord> = Derive<D, Base>

type NormalizeTypeParams<T> = T extends [...infer D extends TraitRecord[], infer Base extends TraitRecord] ? Derive<D, Base> : T extends TraitRecord ? T : never;

// N extends TraitRecord = Normalized extends TraitRecord ? Normalized : never;


type GetBase<T> =
    T extends TraitRecord ? T :
    T extends [infer B extends TraitRecord] ? B :
    T extends [...any[], infer B extends TraitRecord] ? B :
    never;

type GetDerives<T> =
    T extends TraitRecord ? [] :
    T extends [TraitRecord] ? [] :
    T extends [...infer D extends TraitRecord[], TraitRecord] ? D :
    never;

// type AssertTraitRecord<T> = T extends TraitRecord ? T : never;

// const Derives extends 


/**
 * # Usage
 * 
 * Traits have the following parts:
 * 
 * 1. Constant(s)
 * 2. Required(s)
 * 3. Default(s)
 * 
 * ```
 * trait<{
 * 
 *   SOME_CONTANT:number; // you can define associated constants (which can be different or the same for each derived trait depending on it's implementation)
 * 
 *   method(): void; // method signatures are allowed
 *   arrow: () => void; // so are arrow functions
 * 
 *   defaultMethod?(): void; // the question mark indicates this method is "default"
 * 
 *   // the question mark here indicates every instance method is default
 *   [instance]?: {
 *    defaultMethod?(): void; // this function will be added to the instance of the class it is implemented on
 *   }
 * }>(...);
 * ```
 * Hint: you __must__ explicity pass a type parameter to `trait` when defining a trait implementation.
 * 
 * This is interpreted as follows:
 * 1. *Constants* - [ `SOME_CONSTANT` ]
 * 2. *Static*
 * - *Required* - [ `method`, `arrow` ]
 * - *Default* - [ `defaultMethod` ]
 * 3. *Instance* 
 * - *Default* - [ `defaultMethod` ]
 * 
 * 
 * ## Required Constants and Methods
 * 
 * 
 * 1. Syntax
 * - Constant: `{
 * [key: Uppercase<string>]: string | boolean | number | bigint | symbol;
 * }`
 * - Method: `{
 * [key: string]: (...args: any[]) => any;
 * }`
 * 
 * 2. Requirements
 * - _any_ required constant or method defined in `T` __CANNOT__ be implemented by `T`
 * - _any_ required  constant or method defined in `T` __MUST__ be implemented when deriving `T`
 * 
 * 
 * ## Default methods
 * 
 * 
 * 1. Syntax
 * - use a partial `{partial?(): void}` to indicate a method is default
 * 
 * 2. Requirements
 * - default constants are __NOT__ allowed
 * - _any_ default method(s) __must__ be implemented by trait `T`
 * - _any_ default method(s) overridden in a deriving type `D`  __must have the same type signature__ as defined in `T`
 */
export function trait<
    const T extends TraitRecord | TraitRecord[],
    const B extends TraitRecord = GetBase<T>,
    const D extends TraitRecord[] = GetDerives<T>
>(type: TraitImplementation<B, D>): ImplFn<B, D> {
    // @ts-ignore
    return <D extends T>(impl: D) => {
        return <C extends ValidClass>(target: C) => target as any;
    }
};

// type MergeDerives<T extends TraitRecord[]> = any;

// function define<const T extends TraitRecord>(type: TraitImplementation2<T>): DeriveFn<T> {
//     // @ts-ignore
//     return (impl: T) => {
//         return <C extends ValidClass>(target: C) => target as any;
//     }
// };


// type MergeDerives<Ttype extends any[], Props = {}> = Ttype extends [infer Tcurrent extends TraitRecord, ...infer Trest extends Array<any>] ? MergeProps<Trest, Props & Tcurrent> : Props;

// declare function defineWithDerives<
//     const T extends TraitRecord[]
// >(defaultMethods: TraitImplementation2): void;

// const Foo = define<{ foo?(): void; rFoo(): void }>({
//     foo() { }
// });

// const Bar = define<{ bar?(): void }>({
//     bar() { }
// });