import { derive, type Infer, type Trait } from "traits-js";
import { Bar } from "./traits";

// //! Using trait manually
const BarManual = Bar({
    CONSTANT: 5,
    requiredMethod() { },
    additionalMethod() { },
})(class BarManual {
    static staticProp = 5 as const;
    instanceProp = 10 as const;
});

BarManual.staticProp;
new BarManual().instanceProp;

BarManual.CONSTANT;
BarManual.additionalMethod;
BarManual.requiredMethod;


BarManual.defaultMethod;
new BarManual().defaultInstanceMethod;


// //! Using derive helper
const Derived = derive(
    class MyClass {
        static staticProp = 5;
        instanceProp = 10;
    },
    Bar({
        CONSTANT: 5,
        requiredMethod() { },
        additionalMethod() { },
    })
);

// Derived.staticProp;
// Derived.CONSTANT;
// Derived.requiredMethod;
// Derived.defaultMethod;
// Derived.additionalMethod;
// new Derived().instanceProp;
// new Derived().instanceMethod();

// //! Using trait that derives another trait
derive(class { }, Bar({
    CONSTANT: 5,
    requiredMethod() { },
    additionalMethod() { },
}));

// //! Using trait as a decorator
@Bar({
    CONSTANT: 5,
    requiredMethod() { },
    additionalMethod() { },
})
class Untyped { }
//! we must perform a cast to get rid of typescript errors
const Typed = Untyped as Trait<typeof Untyped, [Infer<typeof Bar>]>;
Typed.CONSTANT;


