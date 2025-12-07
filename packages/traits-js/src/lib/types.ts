import type { DefaultKeysOf, EmptyObject, ValidClass, This, OrEmptyObj, Prettify } from "./helper-types";
import { instance, type, type Modifier, type ModifierRecord } from "./modifier";


// type ClassWithProp = (new (...args: any[]) => any) & {himom(): void}; 

// class WithProp implements ClassWithProp {}


type Literal = string | boolean | number | bigint | symbol;
type Fn = (...args: any[]) => any;

type OmitModifiers<T> = Omit<T, Modifier>;

export type MethodRecord = Record<string, Fn>;

export type TraitRecord = {
    readonly [key: string]: Literal | (Fn);
    readonly [key: Uppercase<string>]: Literal;
    readonly [key: symbol]: Record<PropertyKey, any> | (Fn);
    [instance]?: {
        [key: string]: Fn;
        [key: symbol]: (Fn) | ModifierRecord;
    };
    [type]?: unknown[];
}

export type TraitType<Base, Derives> = {
    [$trait]: { base: Base; derives: Derives };
}

/**
 * Used to convert a `TraitRecord` into a class ready to be derived 
 */
export type Trait<Base extends TraitRecord = {}, Derives extends TraitRecord = {}> = TraitType<Base, Derives> & (
    new (
        injection: IntoImpl<Base, Derives>
    ) => Normalize<GetInstance<Base & Derives>>
) & Normalize<OmitModifiers<Base & Derives>> & Self<Base & Derives>;


declare const $trait: unique symbol;

export type Trait2<Base extends TraitRecord = {}, Derives extends TraitRecord[] = [], D = GetTraitRecordsFromDerives<Derives>> = (
    new (
        injection: IntoImpl<Base, D>
    ) => Normalize<GetInstance<Base & D>>
) & { [$trait]: true } & Normalize<OmitModifiers<Base & D>> & Self<Base & D>;


export type IntoTrait<T> = T extends Trait ? T : T extends TraitRecord ? Trait<T> : never;

// export type Derive<Base, Derives> = RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>;


type Class<S, I> = (new () => I) & S;

export type Type<Target extends ValidClass, TargetTrait> =
    Target & Class<
        Target & Prettify<Omit<TargetTrait, Modifier | instance>>,
        InstanceType<Target> & GetInstance<TargetTrait>
    >;

export type Self<T> = This<OmitModifiers<T>>;


type Normalize<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};

type GetRequireds<T> = RequiredMethodsFor<T> & Partial<DefaultMethodsFor<T>>;
type InstanceRequireds<Base, Derives> =
    Derives extends { [instance]: infer D } ?
    {
        [instance]:
        GetRequireds<D & (Base extends { [instance]?: infer B } ? B : {})>
        & Self<D & (Base extends { [instance]: infer I } ? I : {})>
    } :
    Base extends { [instance]: infer I } ?
    {
        [instance]: GetRequireds<I> & Self<I>
    } :
    {};

type InstanceRequiredsNew<Base> =
    Base extends { [instance]: infer I } ?
    {
        [instance]: GetRequireds<I> & Self<I>
    } :
    {};

type RequiredMethodsFor<T> = {
    readonly [P in keyof T as T[P] extends (Fn) | Literal ? P : never]:
    T[P];
};

// type KeepEmpty<T> = T extends EmptyObject ? EmptyObject : T;

type DefaultMethodsFor<T, K extends keyof T = DefaultKeysOf<T>> =
    {
        readonly [P in K as (
            T[P] extends (Fn) | undefined ? P : never
        )
        ]-?: T[P] & {};
    };

type PartialsFor<T> = {
    readonly [P in keyof T as (
        T[P] extends (Fn) | undefined ? P : never
    )
    ]: T[P];
} & {};

type PartialMethods<Base, Derives> = Prettify<(Base extends { [instance]?: infer I } ?
    I extends EmptyObject ? {} :
    { [instance]?: PartialsFor<I> & Self<I & (Derives extends { [instance]: infer D } ? D : never)> } :
    {}) & PartialsFor<Base>
> & Self<Base & Derives>;

type PartialMethodsNew<Base> = Prettify<(Base extends { [instance]?: infer I } ?
    I extends EmptyObject ? {} :
    { [instance]?: PartialsFor<I> & Self<I> } :
    {}) & PartialsFor<Base>
> & Self<Base>;


type GetInstance<T> = T extends { [instance]?: infer I } ? I extends EmptyObject ? {} : I : {};

// TODO: figure out how to exclude `{[instance]:{...}}` in cases where `I` has no default methods
type DefaultInstanceMethods<Base, Derives> =
    Base extends { [instance]?: infer I } ?
    DefaultKeysOf<I> extends never ? {} :
    I extends Record<PropertyKey, never> ? {} :
    {
        [instance]: DefaultMethodsFor<I> & Self<
            GetInstance<Base> & GetInstance<Derives>
        >
    } : {}


export type GetTraitRecordsFromDerives<T extends any[], Merged extends TraitRecord = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends Trait<infer Base, infer Derives> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    never
)> : Merged;


export type NormalizeTraitRecordsFromDerives<T extends any[], Merged extends any[] = []> = T extends [infer Current, ...infer Rest] ? NormalizeTraitRecordsFromDerives<Rest, [...Merged, (
    Current extends Trait2<infer Base, infer Derives> ?
    [Base, ...Derives] :
    Current extends TraitRecord ? Current :
    never
)]> : Merged;

export type Definition<Base, Derives = {}> = OrEmptyObj<DefaultMethodsFor<Base> & DefaultInstanceMethods<Base, Derives>> & Self<Base & Derives>

type RequiredTraitMethods<Base, Derives> = OrEmptyObj<GetRequireds<Derives & Base> & InstanceRequireds<Base, Derives> & Self<Base & Derives>>;
type RequiredTraitMethodsNew<Base> = OrEmptyObj<GetRequireds<Base> & InstanceRequiredsNew<Base> & Self<Base>>;


type IntoImpl<Base, Derives> = (RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>) & Self<Base & Derives>;

type RequiredMethods<T> = (RequiredTraitMethodsNew<T> & PartialMethodsNew<T>);

// type ConvertToImplObject<DeriveArray extends any[], Converted extends any[] = []> = DeriveArray extends


// export type ConvertToImplObject<T extends any[], Merged extends any[] = []> = T extends [infer Current, ...infer Rest] ?
//     ConvertToImplObject<Rest, [...Merged, (
//         Current extends Trait<infer Base, infer Derives> ?
//         Base :
//         Current extends TraitRecord ? Current :
//         never
//     )]> : Merged;


export type Implementation<T> =
    T extends Trait<infer Base, infer Derives> ? IntoImpl<Base, Derives> :
    T extends TraitRecord ? IntoImpl<T, {}> :
    'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `impl`. `impl` may only receive `TraitClass`(s) and / or `TraitRecord`(s)';


export type ImplementationNew<T> =
    T extends TraitType<infer Base, infer Derives> ? IntoImpl<Base, Derives> :
    T extends TraitRecord ? IntoImpl<T, {}> :
    'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `impl`. `impl` may only receive `TraitClass`(s) and / or `TraitRecord`(s)';


// type Foo = {
//     FOO: number;
//     foo1(): void;
//     foo2(): void;
//     sayHello?(name: string): void;
//     [instance]: {
//         instFoo(): void;
//         defInstFoo?(): void;
//     }
// };

// const Foo = trait<Foo>({
//     sayHello(_name) { },
//     [instance]: {
//         defInstFoo() {

//         },
//     }
// });

// class EmptyClass {
//     static #staticProp = 5;
//     static staticProp = 5;
//     instanceProp = 10;

//     static {
//         const Self = this;
//         const fproper = impl<typeof Foo, typeof EmptyClass>((Self) => ({
//             FOO: 1,
//             foo1() {
//                 Self.#staticProp;
//             },
//             foo2() { },
//             [instance]: {
//                 instFoo() { },
//             }
//         }))
//     }

//     // m() {
//     //     new obj().m;
//     //     obj.FOO;
//     //     obj.foo1();
//     //     obj.foo2();
//     //     obj.sayHello('');
//     //     new obj().m();
//     //     new obj().instanceProp;
//     //     new obj().defInstFoo();
//     // }

// }

// const MyTypeect2 = EmptyClass as Type<typeof EmptyClass, typeof Foo>;

// MyTypeect2.foo1();
// MyTypeect2.foo2();
// MyTypeect2.sayHello('what');
// MyTypeect2.staticProp;
// new MyTypeect2().defInstFoo();
// new MyTypeect2().instFoo();
// new MyTypeect2().instanceProp;

// type Branded<T, Brand> = T & {
//     brand: Brand;
// }

// type BranderType = {
//     BRAND: string;
//     brand?<const S extends string>(str: S): Branded<S, 'brand'>;
//     withBrand?<const S extends string, const B extends string>(str: S, brand: B): Branded<S, B>;
//     withBrander?<const S extends string, const B extends Trait<BranderType>>(str: S, brander: B): Branded<S, B['BRAND']>;

//     // [instance]: {
//     //     b(): void;
//     // }
// };

// const Brander = trait<BranderType>({
//     brand<T>(str: T) {
//         return str as Branded<T, 'brand'>;
//     },
//     withBrand<T, B>(str: T) {
//         return str as Branded<T, B>;
//     },
//     withBrander(str, brander) {
//         return brander.brand(str);
//     },
// });

// const Generic1 = trait<{
//     g?<const T extends string, const B extends string>(type: T): Branded<T, B>;
// }>({
//     g<const T extends string, const B extends string>(type: T) { return type as Branded<T, B> }
// });

// const Generic2 = trait<{
//     g?<const N extends number>(obj: { count: N }): typeof obj;
// }>({
//     g(obj) {
//         return obj;
//     }
// });


// const A = trait<{ a?<const T extends string>(type: T): Branded<T, 'branded-from-a'> }, [typeof Generic1, typeof Brander]>({
//     a<T extends string>(type: T) {

//         const defaultBrand = this.brand(type);
//         const customBrand = this.withBrand(type, 'custom');


//         return this.g(type) as Branded<T, 'branded-from-a'>;
//     },
// });


// const B = trait<{ b?<const T extends string>(type: T, brander: typeof A): ReturnType<typeof A['a']> }, [typeof Generic2]>({
//     b(type, brander) {
//         const obj = this.g({ count: 1 });
//         return brander.a(type);
//     },
// });

// const C = trait<{ c?(): void }, [typeof A]>({
//     c() {
//         const str = this.a('string')
//     },
// });


// const D = trait<{ d?(): void }, [typeof B]>({
//     d() {

//     },
// });


// const E = trait<{ e?(): void }, [typeof C, typeof D]>({
//     e() {
//         const o = this.g({ count: 1 });
//         const s = this.g('string');
//         this.a('string');
//         this.b('string', this as unknown as Cast<typeof E, typeof C>);
//         this.c();
//         this.d();
//         this.e();
//     },
// });


// const withSymbols = trait<{ [Symbol.iterator]?(): Iterator<any> }>({
//     [Symbol.iterator]() {
//         return [][Symbol.iterator]();
//     }
// })

// const Bar = trait<{
//     bar(): void;
//     barDef?(): void;
//     [instance]?: {
//         barDefInst?(): void;
//     };
// }, [typeof Foo]>({
//     barDef() {
//         this.FOO;
//         this.sayHello('');
//         this.foo1();
//         this.foo2();
//         this.barDef();
//         this.bar();
//     },
//     [instance]: {
//         barDefInst() {
//             this.defInstFoo();
//             this.instFoo();
//             this.barDefInst();
//         },
//     }
// });

// type BarType = {
//     bar(): void;
//     barDef?(): void;
//     [instance]?: {
//         barDefInst?(): void;
//     };
// };


// const UsesGenerics = trait<{ u?(): void }, [typeof Generic1, typeof Generic2]>({
//     u() {
//         this.g('');
//         this.g({ count: 1 });
//         const g1 = cast<typeof Generic1>();
//         g1.g('');
//         const g2 = cast<typeof Generic2>();
//         g2.g({ count: 1 });
//         const brander = cast<typeof Brander>();
//         brander.BRAND;
//         const valid = cast<typeof Generic2>().g({ count: 1 });
//     },
//     // u() {
//     //     const obj = this.g({ count: 1 });
//     //     const str = this.g('string');
//     //     const invalid = cast<Trait<typeof Generic1>>({}).g('string');
//     //     const valid = cast<Trait<typeof Generic2>>(this).g({ count: 1 });
//     // },
// });

// class FooClass {
//     static himom = 'himom' as const;
//     hidad = 'hidad' as const;
// }

// const FooClassDerivesFooTrait = impl<typeof Foo, typeof FooClass>((self) => ({
//     FOO: 1,
//     foo1() {
//         self.himom;
//         self.prototype.hidad;
//         this.sayHello('');
//         this.FOO;
//         // @ts-expect-error
//         this.FOO = 3;
//         this.foo1();
//         this.foo2();
//         // this[instance].defInstFoo();
//     },
//     foo2() { },
//     [instance]: {
//         instFoo() {
//             this.defInstFoo();
//             this.instFoo();
//         },
//         defInstFoo() {
//         },
//     }
// }));


// type PickInstanceIfHasDefaultKeys<T, Tself = {}> =
//     T extends EmptyObject ? {} :
//     DefaultMethodsFor<T> extends EmptyObject ?
//     {} :
//     DefaultMethodsFor<T> & Self<Tself>;



// type Case1 = {
//     [instance]: {

//     }
// };

// type Case2 = {
//     [instance]?: {

//     }
// };

// type Case3 = {
//     [instance]: {
//         a(): void;
//     }

// };

// type Case4 = {
//     [instance]: {
//         a?(): void;
//     }
// };

// type Case5 = {
//     [instance]?: {
//         a?(): void;
//     }
// };

// type Case6 = {
//     [instance]?: {
//         a?(): void;
//         b(): void;
//     }
// };

// type Test1 = PickInstanceIfHasDefaultKeys<GetInstance<Case1>, Case1>;
// type Test2 = PickInstanceIfHasDefaultKeys<GetInstance<Case2>, Case2>;
// type Test3 = PickInstanceIfHasDefaultKeys<GetInstance<Case3>, Case3>;

// type Test4 = PickInstanceIfHasDefaultKeys<GetInstance<Case4>, Case4>;
// type Test5 = PickInstanceIfHasDefaultKeys<GetInstance<Case5>, Case5>;
// type Test6 = PickInstanceIfHasDefaultKeys<GetInstance<Case6>, Case6>;