import { include, instance, trait, type Trait, type Infer, type ImplFn, type Impl } from 'traits-js';

export type Foo = Infer<typeof Foo>;

export const Foo = trait<{
    CONSTANT: number;
    reqStaticFoo(): void;
    defaultstaticFoo?(): void;

    [instance]: {
        defaultInstanceFoo?(): void;
        reqInstanceFoo(): void;
    };
}>({
    // [include]: {},
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
    },

    [instance]: {
        // [include]: {
        //     defaultInstanceFoo: []
        // },
        defaultInstanceFoo() {

        },
    },
});