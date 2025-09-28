import { include, instance, trait, type Infer } from 'traits-js';

const depends = Symbol('depends');

// type FooDepends = {
//     [depends]: {
//         defaultFoo: [typeof log, typeof trait, SomeObject, typeof FromLibrary];

//         [instance]: {
//             defaultInstanceFoo: ['...'];
//         }

//     };

//     CONSTANT: number;
//     foo(): void;
//     defaultFoo?(): void;

//     [instance]?: {
//         defaultInstanceFoo?(): void;
//     };

// };

// type FooWithoutDepends = {
//     CONSTANT: number;
//     foo(): void;
//     defaultFoo?(): void;


//     [instance]?: {
//         defaultInstanceFoo?(): void;
//     };
// }

export type Foo = Infer<typeof Foo>;


//* file: foo.ts

// import { SomeClass } from 'some-library';
export const Foo = trait<{
    CONSTANT: number;
    reqStaticFoo(): void;
    defaultstaticFoo?(): void;

    [instance]: {
        defaultInstanceFoo?(): void;
        reqInstanceFoo(): void;
    };
}>({
    [include]: {
        defaultstaticFoo: []
    },
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
    },

    [instance]: {
        [include]: {
            defaultInstanceFoo: []
        },
        defaultInstanceFoo() {

        },
    },
});