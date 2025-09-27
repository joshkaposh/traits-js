import { trait, type Derive } from "traits-js";
import { Foo as FooType } from "./foo.trait";

//* "Bar" trait implements "Foo" trait

export const BarIntersection = trait<FooType & { barIntersection(): void; barDefaultIntersection?(): void }>({
    defaultFoo() {
        this.CONSTANT;
        this.defaultFoo();
        this.foo();
        this.barDefaultIntersection();
        this.barIntersection();
    },
    barDefaultIntersection() {

    },
});

export const BarLiteralDerive = trait<Derive<[FooType], { barDerive(): void; barDefaultDerive?(): void }>>({
    defaultFoo() {
        this.CONSTANT;
        this.defaultFoo();
        this.foo();
        this.barDefaultDerive();
        this.barDerive();
    },
    barDefaultDerive() { },
});


export type BarReferenceDeriveType = { barDerive(): void; barDefaultDerive?(): void };
export const BarReferenceDerive = trait<Derive<[FooType], BarReferenceDeriveType>>({
    defaultFoo() {
        this.CONSTANT;
        this.defaultFoo();
        this.foo();
        this.barDefaultDerive();
        this.barDerive();
    },
    barDefaultDerive() { },
});