import { instance } from "traits-js";
import { Foo } from "./traits";

const FooManual = new Foo({
    CONSTANT: 1,
    reqStaticFoo() { },
    defaultstaticFoo() {
        this.defaultstaticFoo();
    },
    [instance]: {
        reqInstanceFoo() { },
    }
});


// // //! Using trait manually
// const BarManual = new Bar({
//     CONSTANT: 1,
//     reqStaticFoo() { },
//     requiredStaticBar() { },
//     [instance]: {
//         reqInstanceFoo() { },
//         reqInstanceBar() { },
//     }
// })(class BarManual {
//     static staticProp = 5 as const;
//     instanceProp = 10 as const;
// });

// BarManual.staticProp;
// new BarManual().instanceProp;

// BarManual.CONSTANT;
// BarManual.reqStaticFoo;
// BarManual.requiredStaticBar;


// BarManual.defaultstaticFoo;
// new BarManual().defaultInstanceFoo;