import { trait, as, impl, } from "traits-js";
import { Foo as FooType } from "./foo.trait";
import type { Trait2 } from "../../../../traits-js/src/lib/types";

export const A = trait<{ a(): void }>({});
export const B = trait<{ b(): void }>({});
export const C = trait<{ c(): void }>({});

export const D = trait<{ d(): void }, [typeof A, typeof B, typeof C]>({});

export const DuplicateMethodAOld = trait<{ duplicate(param: string): void }>({});

export const DuplicateMethodBOld = trait<{ duplicate(param: number): void }>({});

export const DuplicateMethodsOld = trait<{}, [typeof DuplicateMethodAOld, typeof DuplicateMethodBOld]>({});


export class DuplicateMethodClass { }

impl<typeof DuplicateMethodsOld, typeof DuplicateMethodClass>(() => ({
    duplicate() { }
    // duplicate(param) {

    // },
}));



// type Test = typeof DuplicateMethodANew extends Trait2<any> ? true : false;

export const Bar1 = trait<{
    bar?<T extends string>(str: T): T;
}, [typeof FooType]>({
    bar(str) {
        this.CONSTANT;
        return str;
    },
});

export const Bar2 = trait<{
    bar?(n: number): void
}, [typeof Bar1]>({
    bar() {
        // These property accesses will fail at compile time.
        // We need to disambiguate property accesses with the same name
        // by using as the `cast` function
        // e.g cast<typeof Bar2>(0)
        // or `Cast` type
        this.bar(0);
        this.bar('');

        as<typeof D>().d();
    },
});
