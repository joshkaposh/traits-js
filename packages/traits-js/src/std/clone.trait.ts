import { trait, type instance } from "../lib";

export type Instance<T> = T extends new (...args: any[]) => infer I ? I : T;

export type Clone<T = unknown> = {
    [instance]: {
        clone(this: Instance<T>): Instance<T>;
    }
};

export const Clone = trait<Clone>({});