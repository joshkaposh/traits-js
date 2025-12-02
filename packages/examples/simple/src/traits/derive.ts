import { impl, instance, trait, type Derive } from "traits-js";

const FooTrait = trait<{
    foo(): void;
    fooBar?(): void;
    [instance]: {
        foo(): void;
    }
}>({
    fooBar() {

    },
    // [instance]: {}
});



const BarTrait = trait<{ bar(): void }, [typeof FooTrait]>({
    // fooBar() { },
    // [instance]: {}
});



const BarDerived = impl<typeof BarTrait>(() => ({
    foo() { },
    bar() { },
    [instance]: {
        foo() { },
    }
}))


// const FooDerived = impl<typeof FooTrait>(() => ({
//     foo() { },
//     [instance]: {
//         foo() { }
//     }
// }));


