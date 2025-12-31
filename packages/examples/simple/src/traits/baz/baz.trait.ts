import { trait } from 'traits-js';
import { Foo } from '../foo.trait';
import { instance } from 'traits-js/modifier';
export type FooBar = typeof FooBar;
export const FooBar = trait<{
    FOOBAR: string;

    foobar(): void;
}>({});

export const Baz = trait<{
    CONSTANT_BAZ: number;
    baz(): void;
    defaultBaz?(): void;
    [instance]: {
        instanceBaz(): void;
        defInstanceBaz?(): void;
    };
}, [typeof Foo, typeof FooBar]>({
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.foobar();
        this.defaultBaz();
        this.reqStaticFoo();
        this.defaultBaz();
        this.baz();
    },
    [instance]: {
        defInstanceBaz() {
            this.defaultInstanceFoo();
            this.reqInstanceFoo();
            this.defInstanceBaz();
            this.instanceBaz();
        },
    }
});


