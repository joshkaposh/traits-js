import { trait, type instance, type Derive } from 'traits-js';
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
    defaultFoo() { },
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.defaultFoo();
        this.foo();
        this.defaultBaz();
        this.baz();
    },
});


export const BazDerive = trait<Derive<[Foo, FooBar], Baz>>({
    defaultFoo() { },
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.defaultFoo();
        this.foo();
        this.defaultBaz();
        this.baz();
    },
});
