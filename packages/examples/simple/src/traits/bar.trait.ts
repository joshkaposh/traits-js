import { instance, trait, type Derive } from "traits-js";
import { Foo as FooType } from "./foo.trait";

//* "Bar" trait implements "Foo" trait

export type Bar = {
    requiredStaticBar(): void;
    [instance]: {
        reqInstanceBar(): void;
    }
};
export const Bar = trait<Derive<[FooType], Bar>>({
    defaultstaticFoo() { },
    [instance]: {
        defaultInstanceFoo() { },
    }
});

export const BarIntersection = trait<FooType & { barIntersection(): void; barDefaultIntersection?(): void }>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.barDefaultIntersection();
        this.barIntersection();
    },
    barDefaultIntersection() {

    },
    [instance]: {
        defaultInstanceFoo() {

        },
    }
});

export const BarLiteralDerive = trait<Derive<[FooType], { barDerive(): void; barDefaultDerive?(): void }>>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.barDefaultDerive();
        this.barDerive();
    },
    barDefaultDerive() { },
    [instance]: {
        defaultInstanceFoo() {

        },
    }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};

export const FooBarBaz = trait<Derive<[FooType, Bar], FooBarBaz>>({
    defaultstaticFoo() { },
    [instance]: {
        defaultInstanceFoo() { },
    }
});

export type BarReferenceDeriveType = { barDerive(): void; barDefaultDerive?(): void };
export const BarReferenceDerive = trait<Derive<[FooType], BarReferenceDeriveType>>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.barDefaultDerive();
        this.barDerive();
    },
    barDefaultDerive() { },

    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
        },
    }
});