import { instance, trait, type Trait, type Derive } from "traits-js";
import { Foo as FooType } from "./foo.trait";


export type Obj = { name: string };

export type BarType = {
    requiredStaticBar(): void;
    defaultStaticBar?(...obj: Trait<any>[]): void;
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

export const Bar = trait<BarType>({
    defaultStaticBar(obj: Trait<any>, obj2: typeof trait<FooBarBaz>, obj3: Derive<BarType, []>) {
        const v = {};
        console.log(v);

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
    [instance]: {
    }
});

export type Bar1Type = {
    bar1?(): void;
    bar?<T extends string>(str: T): T;
};

export const Bar1 = trait<Bar1Type, [typeof FooType]>({
    bar(t) {
        return t;
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
    }
});

export const BarLiteral = trait<{ BarLiteral(): void; BarDefaultLiteral?(): void }>({
    BarDefaultLiteral() { }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};

export const FooBarBaz = trait<FooBarBaz, [typeof FooType, typeof Bar]>({});
