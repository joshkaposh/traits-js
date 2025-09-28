import { instance, trait, type Derive } from 'traits-js';
import { Foo } from '../foo.trait';

export type FooBar = {
    FOOBAR: string;

    foobar(): void;
};

export const FooBar = trait<FooBar>({});

export type Baz = {
    CONSTANT_BAZ: number;
    baz(): void;
    defaultBaz?(): void;
    [instance]: {
        instanceBaz(): void;
    };
};

export const Baz = trait<Foo & FooBar & Baz>({
    defaultstaticFoo() { },
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.defaultBaz();
        this.reqStaticFoo();
        this.defaultBaz();
        this.baz();
    },
    [instance]: {
        defaultInstanceFoo() { },
    }
});


export const BazDerive = trait<Derive<[Foo, FooBar], Baz>>({
    defaultstaticFoo() { },
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.defaultBaz();
        this.baz();
    },
    [instance]: {
        defaultInstanceFoo() { },
    }
});
