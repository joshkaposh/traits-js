import { instance, trait, type Trait, derive, type Derive } from 'traits-js';
import { include } from 'traits-js/modifier';



export type SayHello = Trait<typeof SayHello>;
export const SayHello = trait<{
    [instance]: {
        name(): string;
        sayHello?(): void;
        greet?(other: { name(): string }): void;
    }
}>({
    [instance]: {
        [include]: {
            sayHello: [trait, derive]
        },
        sayHello() {
            console.log(`${this.name()} says hello!`);
        },
        greet(other) {
            console.log(`Hello ${other.name()}, I'm ${this.name()}. Nice to meet you!`);
        },

    }
})


export type Foo = Trait<typeof Foo>;
export const Foo = trait<{
    CONSTANT: number;
    reqStaticFoo(): void;
    defaultstaticFoo?(): void;

    [instance]: {
        defaultInstanceFoo?(): void;
        reqInstanceFoo(): void;
    };
}>({
    // [include]: {
    //     defaultstaticFoo: []
    // },
    defaultstaticFoo() {
        this.CONSTANT;
        this.defaultstaticFoo();
        this.reqStaticFoo();
    },

    [instance]: {
        [include]: {
            defaultInstanceFoo: []
        },
        defaultInstanceFoo() {

        },
    },
});