import type { ValidClass } from './helper-types';
import type { Definition, GetTraitRecordsFromDerives, Implementation, Trait, TraitRecord, Type } from './types';

export * from './modifier';

export type * from './types';

export type { ValidClass, Prettify, EmptyObject } from './helper-types';

export function as<T>(): T {
    return void 0 as unknown as T;
}

function unused<T>(..._args: any[]): T {
    return void 0 as never;
}




/**
 * ## Usage
 * 
 * The creation and usage of trait requires a strict syntax.
 * This is necessary for traits to work in general and also enables optimizations such as inlining.
 * 
 * Traits *must* be defined at the root ( Program ) scope of a file and *must be a named export*.
 * 
 * Proper usage: 
 * ```
 * export const MyTrait = trait<TraitDescriptor>(TraitImplementation);
 * ```
 * 
 * Improper usage:
 * ```
 * // This is a valid trait, but it is not exported. It will either be silently ignored or result in a compilation error if referenced
 * const MyTrait = trait<TraitDescriptor>(TraitImplementation);
 * 
 * export const MyTrait = {
 *   fn() {
 *     // this call is neither exported nor at the program scope
 *     return trait<{}>({});
 *   }
 * };
 * 
 * 
 * 
 * ```
 * trait<{
 *  foo(): void;
 *  defFoo?(): void;
 * }>({
 *   defFoo() {}
 * });
 * ```,
 * 
 * `foo` is a *required* method and __must__ be implemented by *any* implementor
 * 
 * `defFoo` is a *default* method and __must be implemented by trait authors.
 * 
 *  "Default" methods are annotated by the optional property operator ( `?`, e.g foo?<T>() )
 *  Default methods will be automatically injected into the AST.
 *  and __must__ be implemented by the trait author ( see below )
 *  of any class that implements `Foo`.
 * 
 *  You may override these default methods for more
 *  specific implementations and optimizations to your use case.
 * 
 */
export function trait<const Base extends TraitRecord, const DeriveTypes extends any[] = []>(impl: Definition<Base, GetTraitRecordsFromDerives<DeriveTypes>>): Trait<Base, GetTraitRecordsFromDerives<DeriveTypes>> {
    return unused(impl);
}

/**
 * 
 * `impl` calls are only recognized inside of static blocks or the program scope.
 * 
 * Any call in any other scope is a compilation error and
 * must be moved to either the program scope or static block.
 * @returns `undefined` typed as `Impl<Class, Trait>`, which effectively turns into
 * `Class & Trait & (new (...ConstructorParameters<Class>) => InstanceType<Class & Trait>)`.
 * 
 * At compilation time, the methods specified in the return type of the `Class` parameter
 * and __any__ default methods *not* implemented (both in the trait being implemented, as well as its derived trait(s))
 * will be __injected__ into the class specified in `impl`s type parameter (e.g `impl<SomeTrait, typeof SomeClass>()`)
 * 
 * class SomeClass {}
 * 
 * impl<typeof Foo, typeof SomeClass>(
 * ```
 * `Self` is a reference to `SomeClass` (the constructor type).
 * ```
 * (Self) => ({
 * 
 * 
 * })); 
 * ```
 */
export function impl<const T, const Self extends ValidClass = ValidClass>(
    Class: (self: Self) => Implementation<T>
): Type<Self, T> {
    return unused(Class);
}