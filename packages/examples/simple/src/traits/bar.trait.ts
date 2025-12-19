import { trait, type Trait } from "traits-js";
import { instance } from "traits-js/modifier";
import { Foo as FooType } from "./foo.trait";

export type Obj = { name: string };

export type BarType = {
    requiredStaticBar(): void;
    defaultStaticBar?(...obj: any[]): void;
    [instance]: {
        reqInstanceBar(): void;
    }
};

// export const Foo = {};

export function localFunction(obj: object) {
    console.log(obj);
}

export function arrowOuterFunction(param: any) {

}

export const arrowOuterObject = {};

export const switchObject = {};


const EmptyTrait = trait({
    // [instance]: {}
});

export const Bar = trait<BarType>({
    defaultStaticBar(obj: Trait, obj2: ReturnType<typeof trait<FooBarBaz>>, obj3: Trait<BarType>) {
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
    BarDefaultLiteral() {

    },
});

type FooBarBaz<Self extends object = object> = {
    staticRequiredFooBarBaz(): void;
    defFBZ?(): void;
};

export const FooBarBaz = trait<FooBarBaz, [typeof FooType, typeof Bar]>({
    defFBZ() {
    },
});
