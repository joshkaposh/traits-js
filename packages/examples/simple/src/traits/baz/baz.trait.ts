import { instance, trait } from 'traits-js';
import { Foo } from '../foo.trait';

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
    };
}, [typeof Foo, typeof FooBar]>({
    defaultBaz() {
        this.CONSTANT;
        this.CONSTANT_BAZ;
        this.defaultBaz();
        this.reqStaticFoo();
        this.defaultBaz();
        this.baz();
    },
    [instance]: {
        defaultInstanceFoo() { },
    }
});
