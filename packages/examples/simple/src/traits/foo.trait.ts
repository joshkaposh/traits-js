import { trait, instance, type Infer } from 'traits-js';

const log = () => console.log('himom');

const depends = Symbol('depends');


type SomeObject = object;

class FromLibrary { }

type FooDepends = {
    [depends]: {
        defaultFoo: [typeof log, typeof trait, SomeObject, typeof FromLibrary];

        [instance]: {
            defaultInstanceFoo: ['...'];
        }

    };

    CONSTANT: number;
    foo(): void;
    defaultFoo?(): void;

    [instance]?: {
        defaultInstanceFoo?(): void;
    };

};

type FooWithoutDepends = {
    CONSTANT: number;
    foo(): void;
    defaultFoo?(): void;


    [instance]?: {
        defaultInstanceFoo?(): void;
    };
}
export type Foo = Infer<typeof Foo>;


//* file: foo.ts

// import { SomeClass } from 'some-library';
export const Foo = trait<{
    CONSTANT: number;
    foo(): void;
    defaultFoo?(): void;

    [instance]?: {
        defaultInstanceFoo?(): void;
    };
}>({
    defaultFoo() {
        this.CONSTANT;
        this.defaultFoo();
        this.foo();
        // SomeClass

    },
});


//* file: bar.ts 
//* import {Foo} from './foo;

const ImplFoo = Foo({
    CONSTANT: 0,
    foo() { }
});

class Impl2 { };
class Impl3 { };
class Impl4 { };
class Impl5 { };

ImplFoo(Impl2);
ImplFoo(Impl3);
ImplFoo(Impl4);
ImplFoo(Impl5);


//! COMPILED OUTPUT
class Impl1 {
    static readonly CONSTANT: 0;
    static foo() { }

    static defaultFoo() {
        this.CONSTANT;
        this.defaultFoo();
        this.foo();
    }

    defaultInstanceFoo() { }
};












// ImplFoo(Impl1);
