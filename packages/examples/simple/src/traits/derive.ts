import { derive, instance, trait, type Derive, type Infer } from "traits-js";

const FooTrait = trait<{
    foo(): void;
    fooBar?(): void;
    [instance]: {
        foo(): void;
    }
}>({
    fooBar() {

    },
    [instance]: {}
});

type FooTrait = Infer<typeof FooTrait>;

const FooDerived = derive<[FooTrait]>({
    foo() { },
    [instance]: {
        foo() { }
    }
});

type BarTrait = Infer<typeof BarTrait>;
const BarTrait = trait<Derive<[FooTrait], { bar(): void }>>({
    fooBar() { },
    [instance]: {}
});

const BarDerived = derive<[BarTrait]>({
    foo() { },
    bar() { },
    [instance]: {
        foo() { },
    }
})

