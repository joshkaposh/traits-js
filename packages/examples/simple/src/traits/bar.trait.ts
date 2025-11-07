import { instance, trait, type Trait, type Derive, type Definition, type IntoTrait } from "traits-js";
import { Foo as FooType } from "./foo.trait";

export type Obj = { name: string };

export type BarType = {
    requiredStaticBar(): void;
    defaultStaticBar?(...obj: Trait[]): void;
    [instance]: {
        reqInstanceBar(): void;
    }
};

export function localFunction(obj: object) {
    console.log(obj);
}

export function arrowOuterFunction(param: any) {

}

export const arrowOuterObject = {};

export const switchObject = {};

const A = trait<{ a(): void }>({});
const B = trait<{ b(): void }>({});
const C = trait<{ c(): void }>({});

const D = trait<{ d(): void }, [typeof A, typeof B, typeof C]>({});


export const Bar = trait<BarType>({
    defaultStaticBar(obj: Trait<any>, obj2: ReturnType<typeof trait<FooBarBaz>>, obj3: IntoTrait<Derive<BarType, []>>) {
        const v = {};
        console.log(v);

        FooType;
        const arrow = () => {
            arrowOuterFunction(arrowOuterObject);
        }

        switch (true as any) {
            case '':
                switchObject;
                break;

            default:
                break;
        }


        localFunction(trait);
    },
});

export const Bar1 = trait<{
    bar1?(): void;
    bar?<T extends string>(str: T): T;
}, [typeof FooType]>({
    bar(str) {
        this.CONSTANT;
        return str;
    },
    bar1() { },
});

export const Bar2 = trait<{ bar2?(obj: any): void, bar?(n: number): void }, [typeof Bar, typeof Bar1]>({
    bar2() {
        this.bar1();
        this.requiredStaticBar();
        this.defaultStaticBar({} as never);
    },
    bar() {
        this.bar(0);
        this.bar('');
    },
});

export const BarLiteral = trait<{ BarLiteral(): void; BarDefaultLiteral?(): void }>({
    BarDefaultLiteral() { }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};

export const FooBarBaz = trait<FooBarBaz, [typeof FooType, typeof Bar]>({});
