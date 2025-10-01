import { instance, derive, trait, type Trait, type TraitClass } from "traits-js";
import { Foo, Bar, SayHello } from "./traits";

class _Person implements SayHello {
    #name: string;
    #dadsName: string;
    #momsName: string;
    constructor(name: string, momsName: string, dadsName: string) {
        this.#name = name;
        this.#momsName = momsName;
        this.#dadsName = dadsName;
    }

    [instance] = {
        name() {
            const self = this as unknown as InstanceType<typeof _Person>;
            return self.#name;
        },
        greet(other: any) {
            const self = this as unknown as InstanceType<typeof _Person>;
            if (other.name() === self.#dadsName) {
                console.log('Hey, dad!');
            } else if (other.name() === self.#momsName) {
                console.log('Hey, mom!');
            } else {
                console.log(this.greet(other));
            }
        }
    }

}

class _Person2 extends derive<[Foo, SayHello]>({
    CONSTANT: 1,
    reqStaticFoo() {

    },
    [instance]: {
        reqInstanceFoo() {

        },
        name() {
            return '';
        },
    }
}) {
    #name: string;
    constructor(name: string) {
        super();
        this.#name = name;
    }


}

const Person: TraitClass<typeof _Person, [SayHello]> = _Person as any;

const mom = new Person('Victoria', 'Mavis', 'Ron');
const me = new Person('Joshua', 'Victoria', 'Mark');

console.log(mom.name()); //* Victoria
console.log(me.name()); //* Joshua

mom.sayHello(); //* "Victoria says hello!"
me.sayHello(); //* "Joshua says hello!"

// ! DEFAULT
me.greet(mom) //* "Hello Victoria, I'm Joshua. Nice to meet you!";
// ! CUSTOM GREET
me.greet(mom) //* "Hey, mom!";


@Bar({
    CONSTANT: 1,
    reqStaticFoo() { },
    requiredStaticBar() { },
    [instance]: {
        reqInstanceFoo() { },
        reqInstanceBar() { },
    }
})
class Untyped { }
//! we must perform a cast to get rid of typescript errors
// const Typed = Untyped as Type<typeof Untyped, [Trait<typeof Bar>]>;
// Typed.CONSTANT;


