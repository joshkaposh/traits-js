import { include, instance, type ModifierRecord } from './modifier';

export type MethodRecord = Record<string, (...args: any[]) => any>;

type ConstKey = Uppercase<string>;
type ConstType = string | boolean | number | bigint | symbol;
type ConstRecord = Readonly<Record<ConstKey, ConstType>>;

export type ValidClass<A extends any[] = any[], I extends object = object> = new (...args: A) => I;

export interface TraitRecord extends ConstRecord {
    [instance]?: MethodRecord;
};

type GetBase<T> =
    T extends TraitRecord ? T :
    T extends [infer B extends TraitRecord] ? B :
    T extends [...any[], infer B extends TraitRecord] ? B :
    never;
/**
 * ### Usage
 * 
 * Adds every `TraitRecord` (i.e _trait_) in `Ttype` to `Tclass`.
 */
// export type TraitClass<Tclass, Ttype extends Array<TraitRecord>> = Merge<Tclass, Ttype>;

// export type TraitImplementation2<T extends TraitRecord = {}> = (DefaultInstanceMethods<T> & DefaultMethods<T>) & ThisType<Normalize<T>>;
// export type TraitImplementationWithDerives<T extends TraitRecord = {}, D extends TraitRecord[] = []> = (DefaultInstanceMethods<T> & DefaultMethods<T>) & ThisType<Normalize<MergeProps<D> & T>>;

// export type TraitImplementation<T extends TraitRecord = {}, Derives extends any[] = []> = (DefaultInstanceMethods<T> & DefaultMethods<T>) & ThisType<Normalize<MergeProps<Derives> & T>>;
// export type Derive<Derives extends TraitImplementation[] = [], T extends TraitImplementation = {}> = T & ThisType<MergeProps<Derives> & T>;

// export type DeriveFn<T extends TraitRecord = {}, Derives extends TraitRecord[] = []> = <const C extends ValidClass>(target: C) => TraitClass<C, [...Derives, T]>;
// export type ImplFn<T extends TraitRecord = {}, Derives extends TraitRecord[] = []> = ((implementation: T) => DeriveFn<T extends TraitRecord ? T : never, Derives extends TraitRecord[] ? Derives : []>);

// type Prettify<T> = { [K in keyof T]: T[K] } & {};

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

type PickDefaultMethods<T> = {
    readonly [P in DefaultKeysOf<T> as (
        T[P] extends ((...args: any[]) => any) | undefined ? P : never
    )
    ]-?: T[P] & {};
};

type PickRequiredMethods<T> = {
    readonly [
    P in RequiredKeysOf<T> as T[P] extends ((...args: any[]) => any) | ConstType ? P : never
    ]: T[P];
};


type Trait<Base = {}, Derives = []> = {
    base: Base;
    derives: Derives;
}

type CheckKeys<T, K1, K2> = K1 extends K2 ? never : T;

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


type CreateTrait<T extends any = {}> = T extends any[] ? Trait<Last<T>, MergeDerives<NormalizeDerives<T>>> : Trait<T, {}>;

type Intermediate<Type> =
    Type extends TraitRecord ? Trait<Type, []> :
    Type extends [TraitRecord] ? 'only one type in derive array, may as well use type instead' :
    Type extends [...infer D extends any[], infer T extends TraitRecord] ? Trait<T, D> :
    never;

type ResolveDerives<T extends Trait[], Resolved extends any[] = []> =
    T extends [] ? Resolved :
    T extends [Trait<infer B>] ? [B] :
    T extends [Trait<infer B>, infer Rest extends Trait[]] ? ResolveDerives<Rest, [...Resolved, B]> :
    Resolved;

type ResolveTrait<T> = T extends Trait<infer Base, infer D extends any[]> ?
    D extends [...Trait<infer Dbase, infer Dderives extends any[]>[]] ?
    { base: Base; derives: [Dbase, ...ResolveDerives<Dderives>] } :
    { base: Base; derives: D } : never;


type NormalizeResolvedTraitDerives<T> = T extends {
    derives: infer D extends TraitRecord[]
} ? D : never;

type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type NormalizeDerives<T> = Trait<
    GetBase<T>,
    NormalizeResolvedTraitDerives<
        ResolveTrait<Intermediate<T>>
    >
>;

type MergeDerives<T> = T extends { derives: infer D extends any[] } ? UnionToIntersection<D[number]> : {}
type Last<A> = A extends [...any[], infer T] ? T : never;

// TODO: Merge `C` with `T`
type DeriveFn<Base extends any = any, Derives extends any = any> = <C extends ValidClass>(derive: RequiredTraitMethods<Base, Derives>) => C;

type This<T> = ThisType<{
    readonly [P in keyof T]-?: T[P] & {};
}>;

type DefaultMethodsFor<T> = PickDefaultMethods<T>;
type RequiredMethodsFor<T, Derives> = PickRequiredMethods<Derives & T>;

type DefaultTraitMethods<Base, Derives> = (
    (Base extends { [instance]?: infer I } ?
        I extends Record<PropertyKey, never> ? {} :
        { [instance]: DefaultMethodsFor<I> & This<Omit<I & (Derives extends { [instance]: infer D } ? D : {}), symbol>> } :
        {}) & DefaultMethodsFor<Base>
) & This<Omit<Base & Derives, symbol>>

type RequiredTraitMethods<Base, Derives> = (
    (
        Derives extends { [instance]: infer D } ?
        {
            [instance]: (RequiredMethodsFor<D, Base extends { [instance]: infer B } ? B : {}> &
                Partial<D & Base extends { [instance]: infer B } ? B : {}>) & This<Omit<D & (Base extends { [instance]: infer I } ? I : {}), symbol>>
        } :
        Base extends { [instance]: infer I } ?
        { [instance]: (RequiredMethodsFor<I, {}> & Partial<DefaultMethodsFor<I>>) & This<Omit<I, symbol>> } :
        {}
    ) & RequiredMethodsFor<Base, Derives>
) & This<Omit<Base & Derives, symbol>>;

function trait2<
    const T extends TraitRecord | TraitRecord[],
    const Type extends { base: any; derives: any } = CreateTrait<T>
>(implementation: DefaultTraitMethods<Type['base'], Type['derives']>): DeriveFn<Type['base'], Type['derives']> {
    return void 0 as unknown as DeriveFn<Type['base'], Type['derives']>;

};

function create<const T extends TraitRecord>(impl: DefaultTraitMethods<T, {}>): DeriveFn<T, {}> {
    return void 0 as unknown as DeriveFn<T, {}>;
};

function compose<
    const Derives extends TraitRecord[],
    const Base extends TraitRecord,
    const D = UnionToIntersection<Derives[number]>
>(impl: DefaultTraitMethods<Base, D>): DeriveFn<Base, D> {
    return void 0 as unknown as DeriveFn<Base, D>;
}

type GetTraitRecordsFromDerives<T extends any[], Merged = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends DeriveFn<infer Base, infer Derives> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    {}
)> : Merged;


function createCompose<
    const Base extends TraitRecord,
    const DeriveTypes extends (DeriveFn | TraitRecord)[] = [],
    const D = GetTraitRecordsFromDerives<DeriveTypes>
>(impl: DefaultTraitMethods<Base, D>): DeriveFn<Base, D> {
    return void 0 as unknown as DeriveFn<any, any>
}


type TraitArgs<A> = A extends [...infer Derives extends DeriveFn<infer B, infer D>[], infer T extends TraitRecord] ? [...Derives, DefaultTraitMethods<T, D & B>] :
    A extends [infer T extends TraitRecord] ? DefaultTraitMethods<T, {}> : never;

type Records = GetTraitRecordsFromDerives<[typeof BarCompose]>;

const FooCreateCompose = createCompose<FOO>({
    defFoo() {
        this
    },
    [instance]: {
        defInstFoo() {
            this
        },
    }
});


const barCreateCompose = createCompose<BAR, [typeof FooCreateCompose]>({
    barDef() {
        this
    }
});


const BazCreateCompose = compose<[FOO, BAR, BAR2], BAZ>({
    bazDef() {
        // this.bar<string>(class { })  
    },
});

const BarCompose = compose<[FOO], BAR>({
    barDef() {
        this
    },
});

const BazCompose = compose<[FOO], BAR>({
    barDef() {
        this
    },
});


create<FOO>({
    defFoo() {
        this
    },
    // defFoo() {
    //     this
    // },
    [instance]: {
        defInstFoo() {
            this
        },
    }
    // defFoo() { },
    // [instance]: {
    //     defInstFoo() { },
    // }
});

compose<[FOO], BAR>({
    barDef() {
        this
    },
})

function impl<const Class extends ValidClass, const Trait>(type:
    Trait extends DeriveFn<infer Base, infer Derives> ? RequiredTraitMethods<Base, Derives> :
    never
) {
    return void 0 as unknown as Class;
}

const FooDerive = trait2<FOO>({
    defFoo() {

    },
    [instance]: {
        defInstFoo() {

        },
    }
});

// const BarDerive = trait2<[FOO, BAR]>({
//     barDef() { }
// });

// const BarFinal = BarDerive({
//     FOO: 1,
//     foo1() {

//     },
//     foo2() {

//     },
//     bar() {
//     },
//     [instance]: {
//         instFoo() {
//             this
//         }
//     }

// });

const BarFinal2 = BarCompose({
    FOO: 1,
    foo1() {
        this
    },
    foo2() { },
    bar() { },
    [instance]: {
        instFoo() {
            this
        },
    }
})

const FooFinal = FooDerive({
    FOO: 1,
    foo1() { },
    foo2() { },
    [instance]: {
        instFoo() { },
    }
});

impl<typeof SomeClass, typeof BarCompose>({
    FOO: 1,
    foo1() {

    },
    foo2() {

    },
    bar() {

    },
    [instance]: {
        instFoo() {

        },
    }
})

const TypedClass = impl<typeof SomeClass, typeof FooDerive>({
    FOO: 1,
    foo1() {

    },
    foo2() {

    },
    [instance]: {
        instFoo() {

        },
    }
})

class SomeClass {
    static {
        FooDerive({
            FOO: 1,
            foo1() { },
            foo2() { },
            [instance]: {
                instFoo() { },
            }
        })
    }
}



type FOO = {
    FOO: number;
    foo1(): void;
    foo2(): void;
    defFoo?(): void;
    [instance]: {
        instFoo(): void;
        defInstFoo?(): void;
    }
};

type BAR = {
    bar<T extends string>(): void; barDef?(): void;
    [instance]: {
        //     barDefInst(): void;
    };
};
type BAR2 = { bar<T extends number>(type: new () => any): void; bar2(): void; bar2Def?(): void; };
type BAZ = { baz(): void; bazDef?(): void; };

// P in K as Omit<T, P> extends T ? P : never

// type HasDefaultKeys<T> = keyof RequiredKeysOf<T> extends DefaultKeysOf<T> ? -1 : 0;




type PickInstanceIfHasDefaultKeys<T> = T extends { [instance]?: infer I } ?
    keyof I extends (DefaultKeysOf<I> & string) ? I extends Record<PropertyKey, never> ? never : I : never : never;


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


// const Foo = trait2<FOO>();
// const Bar = trait2<[FOO, BAR]>();
// const Bar2 = trait2<[FOO, BAR2]>();
// const Baz = trait2<[FOO, BAR, BAR2, BAZ]>();


