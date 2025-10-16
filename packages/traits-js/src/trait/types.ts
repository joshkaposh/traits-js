import { instance, type include } from "./modifier";

export type MethodRecord = Record<string, (...args: any[]) => any>;

// type ConstKey = Uppercase<string>;
type ConstType = string | boolean | number | bigint | symbol;



export type ModifierRecord<T = {}> = {
    [include]?: Partial<Record<DefaultKeysOf<T>, unknown[]>>
};

export type Modifier = instance | keyof ModifierRecord


type OmitModifiers<T> = Omit<T, Modifier>;

export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export type TraitRecord = {
    readonly [key: string]: ConstType | ((...args: any[]) => any);
    readonly [key: Uppercase<string>]: ConstType;
    readonly [key: symbol]: ((...args: any[]) => any) | {
        [key: string]: (...args: any[]) => any;
        [key: symbol]: ((...args: any[]) => any) | ModifierRecord;
    };
};

/**
 * ### Usage
 * 
 * Adds every `TraitRecord` (i.e _trait_) in `Ttype` to `Tclass`.
 */
/**
 * Extracts the "default keys" (names of default methods defined in `T`) from trait `T`.
 * 
 * These methods are implemented by _default_.
 * 
 * You may override them with a custom implementation
 * with the same __method signature__ as described by the trait.
 */
export type DefaultKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? P : never]: T[P];
};

// type RequiredKeysOf<T, K extends keyof T = keyof T> = keyof {
//     [P in K as Omit<T, P> extends T ? never : P]: T[K];
// };

export type Derive<Base, Derives> = RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>;

export type TraitObj<Base extends TraitRecord = any, Derives extends TraitRecord = any> = ((new <T extends Derive<Base, Derives> = Derive<Base, Derives>>(injection?: T) => (
    NormalizeType<GetInstance<Base & Derives>>
)
) & NormalizeType<OmitModifiers<Base & Derives>>) & Self<Base & Derives>;

export type Trait<T> =
    T extends TraitObj ?
    T
    : T extends TraitRecord ? TraitObj<T>
    : never;

export type Type<T> =
    T extends TraitObj<infer Base, infer Derives> ? Base & Derives :
    T extends TraitRecord ? T :
    never;
export type Definition<T, D = {}> = DefaultTraitMethods<T, D> & Self<T & D>;

export function trait<const Base extends TraitRecord, const DeriveTypes extends any[] = [], const D extends TraitRecord = GetTraitRecordsFromDerives<DeriveTypes>>(impl: Definition<Base, D>): TraitObj<Base, D> {
    return unused(impl);
}



/**
 * ### Usage
 * 
 * Gets the default method(s) for the specified trait `T`.
 * 
 * Similar to `Omit<T, RequiredKeysOf<T>>`
 * 
 * This should be used as a parameter type.
 * @example
 * ```typescript
 * type MyTrait = {
 *   default?(): void;
 *   required(): void;
 * };
 * // impl is now typed as Omit<MyTrait, 'required'>
 * declare function myFn(impl: Definition<MyTrait>):void
 * ```
 */

// type IntermediateTrait<Base = {}, Derives = []> = {
//     base: Base;
//     derives: Derives;
// }

// type CheckKeys<T, K1, K2> = K1 extends K2 ? never : T;

// type TestKeys = RequiredKeysOf<FOO>;
// type TestKeys2 = RequiredKeysOf<FOO & BAR>;
// type TestKeys3 = DefaultKeysOf<FOO & BAR & BAR2 & BAZ>;

// type Check<A, B> = CheckKeys<A, Exclude<keyof A, symbol>, keyof B>;

// type Conflicts<Base, Derives,
//     Static = CheckKeys<Base, Exclude<keyof Base, symbol>, keyof Derives>,
// > = Static extends Base ?
//     (Base extends { [instance]?: infer I } ?
//         Derives extends { [instance]?: infer D } ?
//         (I extends Check<I, D> ?
//             Base : never
//         )
//         : Base
//         : Base
//     ) :
//     never;

// type Conflicts1 = Conflicts<{ b(): 1 }, { a(): '' }>;
// type Conflicts2 = Conflicts<{ a(): 1 }, { a(): '' }>;
// type Conflicts3 = Conflicts<{ a?(): 1 }, { a(): '' }>;
// type Conflicts4 = Conflicts<{ a(): 1 }, { a?(): '' }>;
// type Conflicts5 = Conflicts<{ a?(): 1 }, { a?(): '' }>;
// type Conflicts6 = Conflicts<{
//     b?(): 1
//     [instance]: {
//         a(): void;
//     }
// }, {
//     a?(): ''
//     [instance]: {
//         b(): void;

//     }

// }>;

// type Intermediate<Type> =
//     Type extends TraitRecord ? IntermediateTrait<Type, []> :
//     Type extends [TraitRecord] ? 'only one type in derive array, may as well use type instead' :
//     Type extends [...infer D extends any[], infer T extends TraitRecord] ? IntermediateTrait<T, D> :
//     never;

// type ResolveDerives<T extends IntermediateTrait[], Resolved extends any[] = []> =
//     T extends [] ? Resolved :
//     T extends [IntermediateTrait<infer B>] ? [B] :
//     T extends [IntermediateTrait<infer B>, infer Rest extends IntermediateTrait[]] ? ResolveDerives<Rest, [...Resolved, B]> :
//     Resolved;

// type ResolveTrait<T> = T extends IntermediateTrait<infer Base, infer D extends any[]> ?
//     D extends [...IntermediateTrait<infer Dbase, infer Dderives extends any[]>[]] ?
//     { base: Base; derives: [Dbase, ...ResolveDerives<Dderives>] } :
//     { base: Base; derives: D } : never;


// type NormalizeResolvedTraitDerives<T> = T extends {
//     derives: infer D extends TraitRecord[]
// } ? D : never;

type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

// type NormalizeDerives<T> = IntermediateTrait<
//     GetBase<T>,
//     NormalizeResolvedTraitDerives<
//         ResolveTrait<Intermediate<T>>
//     >
// >;

// type MergeDerives<T> = T extends { derives: infer D extends any[] } ? UnionToIntersection<D[number]> : {}
// type Last<A> = A extends [...any[], infer T] ? T : never;

type EmptyObject = Record<PropertyKey, never>;

type GetRequireds<T> = RequiredMethodsFor<T> & Partial<DefaultMethodsFor<T>>;
type InstanceRequireds<Base, Derives> =
    Derives extends { [instance]: infer D } ?
    {
        [instance]:
        GetRequireds<D & (Base extends { [instance]: infer B } ? B : never)>
        & Self<D & (Base extends { [instance]: infer I } ? I : never)>
    } :
    Base extends { [instance]: infer I } ?
    {
        [instance]: GetRequireds<I> & Self<I>
    } :
    {};

type This<T> = ThisType<{
    readonly [P in keyof T]-?: T[P] & {};
}>;

type RequiredMethodsFor<T> = {
    readonly [P in keyof T as T[P] extends ((...args: any[]) => any) | ConstType ? P : never]:
    T[P];
};

type DefaultMethodsFor<T, K extends keyof T = DefaultKeysOf<T>> = {
    readonly [P in K as (
        T[P] extends ((...args: any[]) => any) | undefined ? P : never
    )
    ]-?: T[P] & {};
};

type PartialsFor<T> = {
    readonly [P in keyof T as (
        T[P] extends ((...args: any[]) => any) | undefined ? P : never
    )
    ]: T[P];
};
type PartialMethods<Base, Derives> = (
    (Base extends { [instance]?: infer I } ?
        I extends EmptyObject ? {} :
        { [instance]?: PartialsFor<I> & Self<I & (Derives extends { [instance]: infer D } ? D : never)> } :
        {}) & PartialsFor<Base>
) & Self<Base & Derives>;

type GetInstance<T> = T extends { [instance]?: infer I } ? I extends EmptyObject ? {} : I : {};

// TODO: figure out how to exclude `{[instance]:{...}}` in cases where `I` has no default methods
type DefaultInstanceMethods<Base, Derives> =
    Base extends { [instance]?: infer I } ?
    (
        I extends EmptyObject ? {} :
        //* only include `[instance]: I` if `I` has any optional properties
        DefaultMethodsFor<I> extends EmptyObject ? {} :
        {
            [instance]: DefaultMethodsFor<I> & Self<
                I & GetInstance<Derives>
            >
        }
    ) :
    {};

type DefaultInstanceMethods2<Base, Derives> = PickInstanceIfHasDefaultKeys<Base, Base & Derives>
// Base extends { [instance]?: infer I } ?
// (
//     I extends EmptyObject ? {} :
//     //* only include `[instance]: I` if `I` has any optional properties
//     DefaultKeysOf<I> extends infer K extends (keyof I & (string | symbol)) ?
//     {
//         [instance]: DefaultMethodsFor<I, K> & Self<
//             I & GetInstance<Derives>
//         >
//     } :
//     {}
// ) :
// {};



// type Base<T> = T extends TraitObj<infer B> ? B : T extends TraitRecord ? T : never;

declare const fooImpl: PickInstanceIfHasDefaultKeys<GetInstance<Type<typeof Foo>>, Self<GetInstance<Type<typeof Foo>>>>;
fooImpl.defInstFoo;
// declare const FooImpl2: DefaultInstanceMethods<{[instance]: {}}, {}>
// FooImpl2[instance];


type Self<T> = This<OmitModifiers<T>>;

// type Prettify<T> = { [K in keyof T]: T[K] } & {};

type DefaultTraitMethods<Base, Derives> = DefaultMethodsFor<Base> & DefaultInstanceMethods<Base, Derives>

type RequiredTraitMethods<Base, Derives> = (
    GetRequireds<Derives & Base>
    & InstanceRequireds<Base, Derives>
)



type GetTraitRecordsFromDerives<T extends any[], Merged extends TraitRecord = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends TraitObj<infer Base, infer Derives> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    never
)> : Merged;



type Injection<Trait> = Trait extends TraitObj<infer Base, infer Derives> ? RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives> : 'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `inject`. `inject` may only receive `TraitClass`(s)';

// type Class<T = {}> = (new () => T extends { [instance]: infer I } ? { readonly [K in keyof I]-?: I[K] } : {}) & {
//     readonly [K in Exclude<keyof T, symbol>]-?: T[K] & {};
// };

type PickInstance<T> = T extends { [instance]?: infer I } ? OmitModifiers<I> : never;

export type Impl<Target extends ValidClass, TargetTrait extends TraitRecord | TraitObj> = TargetTrait extends TraitObj ?
    (new (...args: ConstructorParameters<Target>) => InstanceType<Target> & InstanceType<TargetTrait>) & Target & TargetTrait
    :
    TargetTrait extends TraitRecord ?
    (new (...args: ConstructorParameters<Target>) => InstanceType<Target> & PickInstance<TargetTrait>) & Target & TraitObj<TargetTrait>
    :
    never;

function unused<T>(..._args: any[]): T {
    return void 0 as never;
}

export type Cast<T, U> = keyof U extends keyof T ? U : never;
export type As<Self extends ValidClass, T extends ValidClass> = Impl<Self, T>;

export function cast<T, U extends T = T>(): Cast<T, U> {
    return void 0 as unknown as Cast<T, U>;
}

export function impl<const Trait, const Self extends ValidClass = ValidClass>(injection: Injection<Trait> | ((self: Self) => Injection<Trait>)): Impl<Self, Trait extends TraitObj<infer B, infer D> ? D & B : never> {
    return unused(injection);
}

const Foo = trait<{
    FOO: number;
    foo1(): void;
    foo2(): void;
    sayHello?(name: string): void;
    [instance]: {
        instFoo(): void;
        defInstFoo?(): void;
    }
}>({
    sayHello(_name) { },
    [instance]: {
        defInstFoo() {

        },
    }
});


class EmptyClass {
    static #staticProp = 5;
    static staticProp = 5;
    instanceProp = 10;

    static {
        const Self = this;
        const fproper = impl<typeof Foo, typeof EmptyClass>(Self => ({
            FOO: 1,
            foo1() {
                Self.#staticProp;
            },
            foo2() { },
            [instance]: {
                instFoo() { },
            }
        }))
    }

    // m() {
    //     const obj = as<typeof EmptyClass, typeof Foo>();
    //     new obj().m;
    //     obj.FOO;
    //     obj.foo1();
    //     obj.foo2();
    //     obj.sayHello('');
    //     new obj().m();
    //     new obj().instanceProp;
    //     new obj().defInstFoo();
    // }

}

const MyTraitObject2 = EmptyClass as As<typeof EmptyClass, typeof Foo>;

MyTraitObject2.foo1();
MyTraitObject2.foo2();
MyTraitObject2.sayHello('what');
MyTraitObject2.staticProp;
new MyTraitObject2().defInstFoo();
new MyTraitObject2().instFoo();
new MyTraitObject2().instanceProp;

type Branded<T, Brand> = T & {
    brand: Brand;
}

type NormalizeType<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};

// type T = Trait<typeof Generic1>;
// type U = ThisType<T>;

// function as<T extends ValidClass, C extends ValidClass>(): As<C, T> {
//     return void 0 as unknown as As<C, T>;
// }

type BranderType = {
    BRAND: string;
    brand?<const S extends string>(str: S): Branded<S, 'brand'>;
    withBrand?<const S extends string, const B extends string>(str: S, brand: B): Branded<S, B>;
    withBrander?<const S extends string, const B extends Trait<BranderType>>(str: S, brander: B): Branded<S, B['BRAND']>;

    // [instance]: {
    //     b(): void;
    // }
};

const Brander = trait<BranderType>({
    brand<T>(str: T) {
        return str as Branded<T, 'brand'>;
    },
    withBrand<T, B>(str: T) {
        return str as Branded<T, B>;
    },
    withBrander(str, brander) {
        return brander.brand(str);
    },
});

const Generic1 = trait<{
    g?<const T extends string, const B extends string>(type: T): Branded<T, B>;
}>({
    g<const T extends string, const B extends string>(type: T) { return type as Branded<T, B> }
});

const Generic2 = trait<{
    g?<const N extends number>(obj: { count: N }): typeof obj;
}>({
    g(obj) {
        return obj;
    }
});


const A = trait<{ a?<const T extends string>(type: T): Branded<T, 'branded-from-a'> }, [typeof Generic1, typeof Brander]>({
    a<T extends string>(type: T) {

        const defaultBrand = this.brand(type);
        const customBrand = this.withBrand(type, 'custom');


        return this.g(type) as Branded<T, 'branded-from-a'>;
    },
});


const B = trait<{ b?<const T extends string>(type: T, brander: Trait<typeof A>): ReturnType<Trait<typeof A>['a']> }, [typeof Generic2]>({
    b(type, brander) {
        const obj = this.g({ count: 1 });
        return brander.a(type);
    },
});

const C = trait<{ c?(): void }, [typeof A]>({
    c() {
        const str = this.a('string')
    },
});


const D = trait<{ d?(): void }, [typeof B]>({
    d() {

    },
});


const E = trait<{ e?(): void }, [typeof C, typeof D]>({
    e() {
        const o = this.g({ count: 1 });
        const s = this.g('string');
        this.a('string');
        this.b('string', this as unknown as Cast<typeof E, typeof C>);
        this.c();
        this.d();
        this.e();
    },
});


const withSymbols = trait<{ [Symbol.iterator]?(): Iterator<any> }>({
    [Symbol.iterator]() {
        return [][Symbol.iterator]();
    }
})

const Bar = trait<{
    bar(): void;
    barDef?(): void;
    [instance]?: {
        barDefInst?(): void;
    };
}, [typeof Foo]>({
    barDef() {
        this.FOO;
        this.sayHello('');
        this.foo1();
        this.foo2();
        this.barDef();
        this.bar();
    },
    [instance]: {
        barDefInst() {
            this.defInstFoo();
            this.instFoo();
            this.barDefInst();
        },
    }
});

const UsesGenerics = trait<{ u?(): void }, [typeof Generic1, typeof Generic2]>({
    u() {
        this.g('');
        this.g({ count: 1 });
        type T = Trait<typeof Generic1>;
        type U = ThisType<T>;
        const g1 = cast<typeof Generic1>();
        g1.g('');
        const g2 = cast<typeof Generic2>();
        g2.g({ count: 1 });
        const brander = cast<typeof Brander>();
        // brander.BRAND
        const valid = cast<Trait<typeof Generic2>>().g({ count: 1 });
    },
    // u() {
    //     const obj = this.g({ count: 1 });
    //     const str = this.g('string');
    //     const invalid = cast<Trait<typeof Generic1>>({}).g('string');
    //     const valid = cast<Trait<typeof Generic2>>(this).g({ count: 1 });
    // },
});

class FooClass { }

const FooClassDerivesFooTrait = impl<typeof Foo, typeof FooClass>((self) => ({
    FOO: 1,
    foo1() { },
    foo2() { },
    [instance]: {
        instFoo() {
        },
        defInstFoo() {
        },
    }
}))

type PickInstanceIfHasDefaultKeys<T, Tself = {}> =
    T extends EmptyObject ? {} :
    DefaultMethodsFor<T> extends EmptyObject ?
    {} :
    DefaultMethodsFor<T> & Self<Tself>;



type Case1 = {
    [instance]: {

    }
};

type Case2 = {
    [instance]?: {

    }
};

type Case3 = {
    [instance]: {
        a(): void;
    }

};

type Case4 = {
    [instance]: {
        a?(): void;
    }
};

type Case5 = {
    [instance]?: {
        a?(): void;
    }
};

type Case6 = {
    [instance]?: {
        a?(): void;
        b(): void;
    }
};

type Test1 = PickInstanceIfHasDefaultKeys<GetInstance<Case1>, Case1>;
type Test2 = PickInstanceIfHasDefaultKeys<GetInstance<Case2>, Case2>;
type Test3 = PickInstanceIfHasDefaultKeys<GetInstance<Case3>, Case3>;

type Test4 = PickInstanceIfHasDefaultKeys<GetInstance<Case4>, Case4>;
type Test5 = PickInstanceIfHasDefaultKeys<GetInstance<Case5>, Case5>;
type Test6 = PickInstanceIfHasDefaultKeys<GetInstance<Case6>, Case6>;