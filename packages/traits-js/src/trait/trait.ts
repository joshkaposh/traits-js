import type { InferTypes, Trait, DeriveFn, ImplFn, Impl, TraitRecord, ValidClass } from "./types";
// TODO: add list of advanced usage examples... after I implement them (Traits deriving other Traits, generic Traits)
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
// @ts-ignore
export function trait<const T extends TraitRecord>(type: Impl<T>): ImplFn<T> {
    // @ts-ignore
    return <D extends T>(impl: D) => {
        return <C extends ValidClass>(target: C) => target as any;
    }
};

export function derive<const C extends ValidClass, const Derives extends DeriveFn[]>(target: C, ..._traits: Derives): Trait<C, InferTypes<Derives>> {
    return target as unknown as Trait<C, InferTypes<Derives>>;
};