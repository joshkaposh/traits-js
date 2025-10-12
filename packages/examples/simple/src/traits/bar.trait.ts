import { instance, trait, type Trait } from "traits-js";
import { Foo as FooType } from "./foo.trait";

export const Bar = trait<{
    requiredStaticBar(): void;
    defaultStaticBar?(): void;
    [instance]: {
        reqInstanceBar(): void;
    }
}>({
    defaultStaticBar() { },
    [instance]: {
    }
});

export const Bar1 = trait<
    [typeof FooType], {
        bar1?(): void;
        bar?<T extends string>(str: T): T;
    }>({
        bar(t) {
            return t;
        },
        bar1() { },
    });


export const Bar2 = trait<[typeof Bar, typeof Bar1], { bar2?(): void, bar?(n: number): void }>({
    bar2() {
        this.bar1();
        this.bar2();
        this.requiredStaticBar();
        this.defaultStaticBar();
    },
    bar() {
        this.bar(0);
        this.bar('');
    }
});

export const BarLiteral = trait<{ BarLiteral(): void; BarDefaultLiteral?(): void }>({
    BarDefaultLiteral() { }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};

export const FooBarBaz = trait<[typeof FooType, typeof Bar], FooBarBaz>({
    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
        },
    }
});
