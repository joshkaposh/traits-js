import type { DefaultKeysOf, EmptyObject, ValidClass, This, OrEmptyObj, Prettify, Instance, RequiredKeysOf } from "./helper-types";
import { instance, type, type Modifier, type ModifierRecord } from "./modifier";

type Literal = string | boolean | number | bigint | symbol;
type Fn = (...args: any[]) => any;

type OmitModifiers<T> = Omit<T, Modifier>;

export type MethodRecord = Record<string, Fn>;

export type TraitRecord = {
    readonly [key: string]: Literal | Fn;
    readonly [key: Uppercase<string>]: Literal;
    readonly [key: symbol]: Fn | Record<PropertyKey, any>;
    [instance]?: {
        [key: string]: Fn;
        [key: symbol]: (Fn) | ModifierRecord;
    };
    [type]?: unknown[];

}

/**
 * Used to convert a `TraitRecord` into a class ready to be derived 
 */
export type Trait<Base extends TraitRecord = {}, Derives extends TraitRecord = {}> = (
    new (
        properties: RequiredTraitProperties<Base, Derives>
    ) => Normalize<GetInstance<Base & Derives>>
) & Normalize<OmitModifiers<Base & Derives>> & Self<Base & Derives>;

export type IntoTrait<T> = T extends Trait ? T : T extends TraitRecord ? Trait<T> : never;

export type Type<Target extends ValidClass, TargetTrait> =
    Target & ((new () => InstanceType<Target> & GetInstance<TargetTrait>
    ) & Prettify<Omit<TargetTrait, Modifier | instance>>
    );


export type Self<T> = This<OmitModifiers<T>>;

type Normalize<T> = {
    readonly [P in keyof T]-?: T[P] & {};
};

type RequiredTraitProperties<T, D = never, Target = any> = (
    PickPartials<T & D> & PickRequiredProps<T & D> & Self<T & D & Target>
) & RequiredInstanceProps<T, D, Instance<Target>>;

type RequiredInstanceProps<T, D, SelfType> = T extends { [instance]?: infer I } ?
    RequiredKeysOf<I> extends never ? {} :
    I extends Record<PropertyKey, never> ? {} :
    {
        [instance]: (
            PickPartials<I & GetInstance<D>> & PickRequiredProps<I & GetInstance<D>>
        ) & Self<I & GetInstance<D> & SelfType>
    } : never

type PickRequiredProps<T> = {
    readonly [P in keyof T as T[P] extends (Fn) | Literal ? P : never]:
    T[P];
};

type DefaultMethods<T> =
    {
        readonly [P in DefaultKeysOf<T> as (
            T[P] extends (Fn) | undefined ? P : never
        )
        ]-?: T[P] & {};
    };

type PickPartials<T> = {
    readonly [P in keyof T as (
        T[P] extends (Fn) | undefined ? P : never
    )
    ]: T[P];
} & {};

type GetInstance<T> = T extends { [instance]?: infer I } ? I extends EmptyObject ? {} : I : {};

type DefaultInstanceMethods<Base, Derives> =
    Base extends { [instance]?: infer I } ?
    DefaultKeysOf<I> extends never ? {} :
    I extends Record<PropertyKey, never> ? {} :
    {
        [instance]: DefaultMethods<I> & Self<
            GetInstance<Base> & GetInstance<Derives>
        >
    } : {}


export type GetTraitRecordsFromDerives<T extends any[], Merged extends TraitRecord = {}> = T extends [infer Current, ...infer Rest] ? GetTraitRecordsFromDerives<Rest, Merged & (
    Current extends Trait<infer Base extends TraitRecord, infer Derives extends TraitRecord> ?
    Derives & Base :
    Current extends TraitRecord ? Current :
    never
)> : Merged;


export type Definition<Base, Derives = {}> = OrEmptyObj<DefaultMethods<Base> & DefaultInstanceMethods<Base, Derives>> & Self<Base & Derives>

export type Implementation<T, Target> =
    T extends Trait<infer Base extends TraitRecord, infer Derives extends TraitRecord> ? RequiredTraitProperties<Base, Derives, Target> :
    T extends TraitRecord ? RequiredTraitProperties<T, {}, Target> :
    'Error: if you are seeing this, you tried passing a type that was not created from `trait` to `impl`. `impl` may only receive `TraitClass`(s) and / or `TraitRecord`(s)';