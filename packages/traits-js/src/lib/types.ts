import type { DefaultKeysOf, EmptyObject, ValidClass, This, OrEmptyObj, Prettify } from "./helper-types";
import { instance, type, type Modifier, type ModifierRecord } from "./modifier";


type ConstType = string | boolean | number | bigint | symbol;
type OmitModifiers<T> = Omit<T, Modifier>;

export type MethodRecord = Record<string, (...args: any[]) => any>;
export type TraitRecord = {
    readonly [key: string]: ConstType | ((...args: any[]) => any);
    readonly [key: Uppercase<string>]: ConstType;
    readonly [key: symbol]: Record<PropertyKey, any>;
} & {
    [instance]?: {
        [key: string]: (...args: any[]) => any;
        [key: symbol]: ((...args: any[]) => any) | ModifierRecord;
    };
    [type]?: unknown[];
};

/**
 * Used to convert a `TraitRecord` into a class ready to be derived 
 */
export type Trait<Base extends TraitRecord = {}, Derives extends TraitRecord = {}> = (
    new (
        injection: IntoImpl<Base, Derives>
    ) => Normalize<GetInstance<Base & Derives>>
) & Normalize<OmitModifiers<Base & Derives>> & Self<Base & Derives>;

export type IntoTrait<T> = T extends Trait ? T : T extends TraitRecord ? Trait<T> : never;

// export type Derive<Base, Derives> = RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>;


type Class<S, I> = (new () => I) & S;

export type Type<Target extends ValidClass, TargetTrait> =
    IntoTrait<TargetTrait> extends infer T extends ValidClass ?
    Target & Class<
        Target & Prettify<Omit<T, Modifier | instance>>,
        InstanceType<Target> & GetInstance<T>
    > :
    never;

// Target & (new (...args: ConstructorParameters<Target>) => (InstanceType<Target & I> )) & T : never;

// const FooType = trait<{ foo(): void }>({});

class FooClass2 { }

// const WHAT = impl<typeof FooType, typeof FooClass2>(() => ({
//     foo() {

//     },
// }));

// type WhatInst = InstanceType<typeof WHAT>;
// Impl<ConstructorParameters<Target>, Target & { [K in keyof T]: T[K] }, InstanceType<Target> & InstanceType<T>> : never;


export type Self<T> = This<OmitModifiers<T>>;


type Normalize<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};

// export type Impl<Target extends ValidClass, TargetTrait> = TargetTrait extends Trait ?
//     (new (...args: ConstructorParameters<Target>) => InstanceType<Target> & InstanceType<TargetTrait>) & Target & TargetTrait
//     :
//     TargetTrait extends TraitRecord ?
//     (new (...args: ConstructorParameters<Target>) => InstanceType<Target> & PickInstance<TargetTrait>) & Target & Trait<TargetTrait>
//     :
//     never;


// type Base<T> = T extends Trait<infer B extends TraitRecord> ? B : never;
// type Derives<T> = T extends Trait<any, infer D> ? D : {};

// // function traitNew<const T extends Trait>(definition: Definition<Base<T>, Derives<T>>): T {
// //     return unused(definition);
// // }


// // const FooNew = traitNew<Trait<Foo>>({
// //     sayHello(name) {

// //     },
// //     [instance]: {
// //         defInstFoo() {

// //         },
// //     }
// // });


// const Iter = traitNew<Trait<Iter>>({
//     [instance]: {
//         [Symbol.iterator]() {
//             return this;
//         }
//     }
// });

// type Instance<T> = {
//     next(): IteratorResult<T>;
//     [Symbol.iterator]?(): Iterator<T>;
// };

// type Iter<T = any> = {
//     [type]: [T];
//     [instance]: Instance<T>;
// };


// const BarNew = traitNew<Trait<BarType, Foo>>({
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

// class IterMe {

//     static {

//         impl<typeof Iter, typeof IterMe>((self) => ({
//             [instance]: {
//                 next() {
//                     if (self.prototype.#len) {
//                         self.prototype.#len -= 1;
//                         return { done: false, value: this }
//                     } else {
//                         return { done: true, value: void 0 }
//                     }
//                 },
//             }
//         }));
//     }


//     #len: number;
//     constructor(len: number) {
//         this.#len = len;
//     }
// }

// type UnionToIntersection<U> =
//     (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;


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



type RequiredMethodsFor<T> = {
    readonly [P in keyof T as T[P] extends ((...args: any[]) => any) | ConstType ? P : never]:
    T[P];
};

// type KeepEmpty<T> = T extends EmptyObject ? EmptyObject : T;

type DefaultMethodsFor<T, K extends keyof T = DefaultKeysOf<T>> =
    {
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
} & {};

type PartialMethods<Base, Derives> = Prettify<(Base extends { [instance]?: infer I } ?
    I extends EmptyObject ? {} :
    { [instance]?: PartialsFor<I> & Self<I & (Derives extends { [instance]: infer D } ? D : never)> } :
    {}) & PartialsFor<Base>
> & Self<Base & Derives>;

type GetInstance<T> = T extends { [instance]?: infer I } ? I extends EmptyObject ? {} : I : {};

// TODO: figure out how to exclude `{[instance]:{...}}` in cases where `I` has no default methods
type DefaultInstanceMethods<Base, Derives> =
    Base extends { [instance]?: infer I } ?
    (
        I extends EmptyObject ? EmptyObject :
        //* only include `[instance]: I` if `I` has any optional properties
        DefaultMethodsFor<I> extends EmptyObject ? {} :
        {
            [instance]: DefaultMethodsFor<I> & Self<
                I & GetInstance<Derives>
            >
        }
    ) :
    {};


export type GetTraitRecordsFromDerives<T extends any[], Merged extends TraitRecord = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends Trait<infer Base, infer Derives> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    never
)> : Merged;




export type Definition<Base, Derives = {}> = OrEmptyObj<DefaultMethodsFor<Base> & DefaultInstanceMethods<Base, Derives>> & Self<Base & Derives>

type RequiredTraitMethods<Base, Derives> = OrEmptyObj<GetRequireds<Derives & Base> & InstanceRequireds<Base, Derives> & Self<Base & Derives>>;

type IntoImpl<Base, Derives> = (RequiredTraitMethods<Base, Derives> & PartialMethods<Base, Derives>) & Self<Base & Derives>;

export type Implementation<T> =
    T extends Trait<infer Base, infer Derives> ? IntoImpl<Base, Derives> :
    T extends TraitRecord ? IntoImpl<T, {}> :
    'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `impl`. `impl` may only receive `TraitClass`(s) and / or `TraitRecord`(s)';

type Foo = {
    FOO: number;
    foo1(): void;
    foo2(): void;
    sayHello?(name: string): void;
    [instance]: {
        instFoo(): void;
        defInstFoo?(): void;
    }
};

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

class FooClass {
    static himom = 'himom' as const;
    hidad = 'hidad' as const;
}

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