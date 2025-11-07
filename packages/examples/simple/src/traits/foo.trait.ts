import { instance, trait, impl } from 'traits-js';

export const Foo = trait<{
    CONSTANT: number;
    reqStaticFoo(): void;
    defaultstaticFoo?(): void;

    [instance]: {
        defaultInstanceFoo?(): void;
        reqInstanceFoo(): void;
    };
}>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
    },

    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
        },
    },
});

export const Simple = trait<{
    method(): void;
    [instance]: { method(param: number): void }
}>({});

export class SomeClass {
    static someProp = 1;
    static #privateProp = 2;
    instanceProp = 3;
    instanceMethod() { }

    static {


        /**
         ** An example of an incorrect call:
            ```
            ** 
            ```
         */

        const What = impl<typeof Simple, typeof SomeClass>(() => ({
            method() {

            },
            [instance]: {
                method() {

                },
            }
        }));

        What.method();
        What.#privateProp;
        What.someProp;
        const what = new What();
        new What().instanceProp;
        new What().instanceMethod();
        new What().method(0);

    }
}

//* This method of implementing traits ensures
//* no private property accesses can occur
export const SomeClassImplsFoo = impl<typeof Foo, typeof SomeClass>((Self) => ({
    CONSTANT: 1,
    reqStaticFoo() {
        Self.someProp;
        // @ts-expect-error
        Self.#privateProp;
    },
    [instance]: {
        reqInstanceFoo() { },
    }
}));

export const EmptyTrait = trait<{ r(): void; d(): void; }>(
    {
        // what() { },
        // d() {

        // },
    }
);




/**
 * 
 * Currently, traits can only be applied to classes
 * 
 * There are multiple ways to apply traits
 * 
 * If you desire to use a private property, e.g. `#foo`,
 * you must use a static initialization block to do so
 * 
 * ```
 * class SomeClass {
 * 
 *   static {
 *     
 *   }
 * }
 * ```
 * 
 */