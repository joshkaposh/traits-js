import { instance } from "traits-js";
import { Bar, Foo } from "./traits";

const FooManual = Foo({
    CONSTANT: 1,
    reqStaticFoo() { },
    [instance]: {
        reqInstanceFoo() { },
    }
});


// //! Using trait manually
const BarManual = Bar({
    CONSTANT: 1,
    reqStaticFoo() { },
    requiredStaticBar() { },
    [instance]: {
        reqInstanceFoo() { },
        reqInstanceBar() { },
    }
})(class BarManual {
    static staticProp = 5 as const;
    instanceProp = 10 as const;
});

BarManual.staticProp;
new BarManual().instanceProp;

BarManual.CONSTANT;
BarManual.reqStaticFoo;
BarManual.requiredStaticBar;


BarManual.defaultstaticFoo;
new BarManual().defaultInstanceFoo;


const FooClass = FooManual(class FooClass { });
