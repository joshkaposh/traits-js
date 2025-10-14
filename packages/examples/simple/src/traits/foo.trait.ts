import { instance, trait } from 'traits-js';
import { include } from 'traits-js/modifier';

export const Foo = trait<{
    CONSTANT: number;
    reqStaticFoo(): void;
    defaultstaticFoo?(): void;

    [instance]: {
        defaultInstanceFoo?(): void;
        reqInstanceFoo(): void;
    };
}>({
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
    },

    [instance]: {
        defaultInstanceFoo() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
        },
    },
});