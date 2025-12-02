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

export const BarLiteral = trait<{ BarLiteral(): void; BarDefaultLiteral?(): void }>({
    BarDefaultLiteral() { }
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
};

export const FooBarBaz = trait<FooBarBaz, [typeof FooType, typeof Bar]>({});
