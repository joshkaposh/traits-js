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
export const Bar1 = trait<[FooType, Bar1]>({
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

export const BarIntersectionImplicit = trait<[FooType, { barImplicitIntersection(): void; barDefaultImplicitIntersection?(): void }]>({
    barDefaultImplicitIntersection() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.barDefaultImplicitIntersection();
        this.barImplicitIntersection();
    },
    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
        },
    }
});


export const BarIntersectionReferences = trait<FooType & Trait<typeof BarLiteral>>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.BarDefaultLiteral();
        this.BarLiteral();
    },
    BarDefaultLiteral() { },
    [instance]: {
        defaultInstanceFoo() {

        },
    }
});

export const BarLiteralDerive = trait<[FooType, { barDerive(): void; barDefaultDerive?(): void }]>({
    // defaultstaticFoo() {
    // },
    barDefaultDerive() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
        this.barDefaultDerive();
        this.barDerive();

    },
    [instance]: {
        defaultInstanceFoo() {

        },
    }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};


export const FooBarBaz = trait<[FooType, Bar, FooBarBaz]>({
    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceBar();
            this.reqInstanceFoo();
        },
    }
});

export type BarReferenceDeriveType = { barDerive(): void; barDefaultDerive?(): void };
export const BarReferenceDerive = trait<[FooType, BarReferenceDeriveType]>({
    barDefaultDerive() {
        this.CONSTANT;
        this.reqStaticFoo();
        this.barDerive();
        this.barDefaultDerive();
        this.defaultstaticFoo();
    },

    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
        },
    }
});