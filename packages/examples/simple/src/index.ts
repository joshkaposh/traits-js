import { type Infer, instance, type TraitClass, derive, type DeriveFn, trait, type Derive } from "traits-js";
import { Foo, Bar } from "./traits";

const What = derive<[Foo, Bar]>({
    CONSTANT: 1,
    reqStaticFoo() { },
    requiredStaticBar() { },
    [instance]: {
        reqInstanceFoo() { },
        reqInstanceBar() { },
    }
});

What.CONSTANT;
What.reqStaticFoo;
What.defaultstaticFoo;
new What().defaultInstanceFoo();
new What().reqInstanceFoo();
new What().requiredStaticBar();

const What2 = derive<[Foo, Bar]>({
    CONSTANT: 1,
    requiredStaticBar() { },
    reqStaticFoo() { },
    [instance]: {
        reqInstanceFoo() { },
        reqInstanceBar() { },
    }
})



// class MyClassDerives extends derive<[Foo, Bar]>({

// }) {
//     static someProp = 5;
//     instanceProp = 10;
// }

// // //! Using derive helper
// const Derived = deriveOld(
//     class MyClass {
//         static staticProp = 5;
//         instanceProp = 10;
//     },
//     Bar({
//         CONSTANT: 1,
//         reqStaticFoo() { },
//         requiredStaticBar() { },
//         [instance]: {
//             reqInstanceFoo() { },
//             reqInstanceBar() { },

//         }
//     })
// );

// Derived.staticProp;
// Derived.CONSTANT;
// Derived.requiredMethod;
// Derived.defaultMethod;
// Derived.additionalMethod;
// new Derived().instanceProp;
// new Derived().instanceMethod();

//! Using trait that derives another trait
// deriveOld(class { }, Bar({
//     CONSTANT: 1,
//     reqStaticFoo() { },
//     requiredStaticBar() { },
//     [instance]: {
//         reqInstanceFoo() { },
//         reqInstanceBar() { },

//     }
// }));

// //! Using trait as a decorator
@Bar({
    CONSTANT: 1,
    reqStaticFoo() { },
    requiredStaticBar() { },
    [instance]: {
        reqInstanceFoo() { },
        reqInstanceBar() { },

    }
})
class Untyped { }
//! we must perform a cast to get rid of typescript errors
const Typed = Untyped as TraitClass<typeof Untyped, [Infer<typeof Bar>]>;
Typed.CONSTANT;


