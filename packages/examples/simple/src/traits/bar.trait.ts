import { instance, trait, type Trait } from "traits-js";
import { Foo as FooType } from "./foo.trait";

//* "Bar" trait implements "Foo" trait

export type Bar = {
    requiredStaticBar(): void;
    defaultStaticBar?(): void;
    [instance]?: {
        reqInstanceBar(): void;
    }
};

export type Bar1 = { bar1?(): void };
export const Bar1 = trait<[FooType], Bar1>({
    bar1() {
    },
    [instance]: {
        defaultInstanceFoo() { }
    }
});

export const Bar = trait<Bar>({
    defaultStaticBar() { }
});

export const Bar2 = trait<[Bar, Bar1, { bar2?(): void }]>({
    bar2() {
        this.bar1();
        this.bar2();
        this.requiredStaticBar();
        this.defaultStaticBar();
    }
});

export const BarLiteral = trait<{ BarLiteral(): void; BarDefaultLiteral?(): void }>({
    BarDefaultLiteral() { }
});


type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};


export const FooBarBaz = trait<[FooType, Bar], FooBarBaz>({
    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
        },
    }
});
