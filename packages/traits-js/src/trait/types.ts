import { include, instance, type Modifier, type ModifierRecord } from './modifier';

export type MethodRecord = Record<string, (...args: any[]) => any>;

type ConstKey = Uppercase<string>;
type ConstType = string | boolean | number | bigint | symbol;

type OmitModifiers<T> = Omit<T, Modifier>;

export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export type TraitRecord = {
    readonly [key: string]: ConstType | ((...args: any[]) => any);
    readonly [key: symbol]: ((...args: any[]) => any) | (MethodRecord & {});
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
    [P in K as Omit<T, P> extends T ? P : never]: T[K];
};
type RequiredKeysOf<T, K extends keyof T = keyof T> = keyof {
    [P in K as Omit<T, P> extends T ? never : P]: T[K];

};


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
 * declare function myFn(impl: Impl<MyTrait>):void
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

type GetInstance<T> = T extends { [instance]?: infer I } ? I : object;

// TODO: figure out how to exclude `{[instance]:{...}}` in cases where `I` has no default methods
type DefaultInstanceMethods<Base, Derives> = Base extends { [instance]?: infer I } ?
    I extends EmptyObject ? {} :
    //* only include `[instance]: I` if `I` has any optional properties
    DefaultKeysOf<I> extends infer K extends (keyof I & (string | symbol)) ?
    {
        [instance]: DefaultMethodsFor<I, K> & Self<
            I & (Derives extends { [instance]: infer D } ?
                D extends EmptyObject ? {} : D :
                {}
            )
        >
    } :
    {} :
    {};


type Self<T> = This<OmitModifiers<T>>;

// type Prettify<T> = { [K in keyof T]: T[K] } & {};

type DefaultTraitMethods<Base, Derives> = DefaultMethodsFor<Base> & DefaultInstanceMethods<Base, Derives>


type RequiredTraitMethods<Base, Derives> = (
    GetRequireds<Derives & Base>
    & InstanceRequireds<Base, Derives>
)

export type Derive<Base, Derives> = RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>;

export type TraitClass<Base extends TraitRecord = any, Derives extends TraitRecord = any> = ((new <T extends any = RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>>(injection?: T) => (
    NormalizeType<GetInstance<Base & Derives>>
)
) & NormalizeType<OmitModifiers<Base & Derives>>) & Self<Base & Derives>;

type GetTraitRecordsFromDerives<T extends any[], Merged extends TraitRecord = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends TraitClass<infer Base, infer Derives> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    {}
)> : Merged;


type Impl<T, D> = DefaultTraitMethods<T, D> & Self<T & D>;
export function trait<const Base extends TraitRecord, const DeriveTypes extends any[] = [], const D extends TraitRecord = GetTraitRecordsFromDerives<DeriveTypes>>(impl: Impl<Base, D>): TraitClass<Base, D> {
    return void 0 as unknown as TraitClass<Base, D>;
}


type NormalizeInner<T> = PickInstanceIfHasDefaultKeys<T> extends -1 ? OmitModifiers<T> : never;

export type Trait<T> = T extends TraitClass<infer B, infer D> ?
    Required<NormalizeInner<D & B>>
    : T extends TraitRecord ?
    Required<NormalizeInner<T>>
    : never;


type Injection<Trait> = Trait extends TraitClass<infer Base, infer Derives> ? Derive<Base, Derives> : 'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `inject`. `inject` may only receive `TraitClass`(s)';

type Class<T> = (new () => T extends { [instance]: infer I } ? { readonly [K in keyof I]-?: I[K] } : {}) & {
    readonly [K in Exclude<keyof T, symbol>]-?: T[K] & {};
};

type Constructor<A extends any[], S, I> = (new (...args: A) => I) & S;

// type Merge<Target extends new (...args: any[]) => any, Trait extends new () => any> = (new (...args: ConstructorParameters<Target>) => InstanceType<Target> & InstanceType<Trait>) & Trait;
type Merge<Target extends ValidClass, Trait extends ValidClass> = Constructor<ConstructorParameters<Target>, Target & Trait, InstanceType<Target> & InstanceType<Trait>>
export function inject<const C extends ValidClass, const Trait>(type: Injection<Trait>): Merge<C, Class<Trait extends TraitClass<infer B, infer D> ? D & B : never>> {
    return void 0 as unknown as Merge<C, Class<Trait extends TraitClass<infer B, infer D> ? D & B : never>>;
    // return void 0 as unknown as Class<Trait extends TraitClass<infer T, infer D> ? D & T : never>;
}

class EmptyClass {
    static staticProp = 5;
    static {
        inject<typeof EmptyClass, typeof Foo>({
            FOO: 1,
            foo1() {
            },
            foo2() {

            },
            [instance]: {
                instFoo() { },
            }
        })
    }

    m() {
        const obj = as<typeof Foo, typeof EmptyClass>();
        new obj().m;
        obj.FOO;
        obj.foo1();
        obj.foo2();
        obj.sayHello('');
        new obj().m();
        new obj().instanceProp;
        new obj().defInstFoo();
    }

    instanceProp = 10;
}

const MyTraitObject = inject<typeof EmptyClass, typeof Foo>({
    FOO: 1,
    foo1() {
    },
    foo2() {

    },
    [instance]: {
        instFoo() {

        },
    }
});

MyTraitObject.foo1();
MyTraitObject.foo2();
MyTraitObject.sayHello('what');
MyTraitObject.staticProp;
new MyTraitObject().defInstFoo();
new MyTraitObject().instFoo();
new MyTraitObject().instanceProp;


type Branded<T, Brand> = T & {
    brand: Brand;
}

type NormalizeType<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};

// type T = Trait<typeof Generic1>;
// type U = ThisType<T>;
type Into<T, U> = keyof U extends keyof T ? U : never;

function cast<T, U extends T = T>(self: U): Into<T, U> {
    return self as Into<T, U>;
}

function as<T extends Class<unknown>, C extends ValidClass>(): Merge<C, T> {
    return void 0 as unknown as Merge<C, T>;
}

type G1 = Trait<typeof Generic1>;

type BranderType<T extends string = string> = {
    BRAND: T;
    brand?<const S extends string>(str: S): Branded<S, T>;
    withBrand?<const S extends string, const B extends string>(str: S, brand: B): Branded<S, B>;
    withBrander?<const S extends string, const B extends Trait<BranderType>>(str: S, brander: B): Branded<S, B['BRAND']>;

    // [instance]: {
    //     b(): void;
    // }
};

const Brander = trait<BranderType<'brand'>>({
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
        this.b('string', this);
        this.c();
        this.d();
        this.e();
    },
});

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
    sayHello(name) { },
    [instance]: {
        defInstFoo() {

        },
    }
});

const withSymbols = trait<{ [Symbol.iterator]?(): Iterator<any> }>({
    [Symbol.iterator]() {
        return [][Symbol.iterator]();
    }
})

const foo = new Foo({});

class FooClass { }

inject<typeof FooClass, typeof Foo>({
    FOO: 1,
    foo1() { },
    foo2() { },
    [instance]: {
        instFoo() {
        },
        defInstFoo() {
        },
    }
})

foo.defInstFoo();
foo.instFoo();

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
        const c = cast<Trait<typeof Generic1>>(this);

        // const invalid = cast<Trait<typeof Generic1>>({}).g('string');
        const valid = cast<Trait<typeof Generic2>>(this).g({ count: 1 });
    },
    // u() {
    //     const obj = this.g({ count: 1 });
    //     const str = this.g('string');
    //     const invalid = cast<Trait<typeof Generic1>>({}).g('string');
    //     const valid = cast<Trait<typeof Generic2>>(this).g({ count: 1 });
    // },
});


type PickInstanceIfHasDefaultKeys<T> = T extends { [instance]?: infer I } ?
    (keyof I extends (DefaultKeysOf<I> & (string | symbol)) ? I extends EmptyObject ?
        -1 : I :
        -1) :
    -1;


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

type Test1 = PickInstanceIfHasDefaultKeys<Case1>;
type Test2 = PickInstanceIfHasDefaultKeys<Case2>;
type Test3 = PickInstanceIfHasDefaultKeys<Case3>;

type Test4 = PickInstanceIfHasDefaultKeys<Case4>;
type Test5 = PickInstanceIfHasDefaultKeys<Case5>;