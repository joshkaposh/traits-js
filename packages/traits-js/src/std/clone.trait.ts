import { trait, self, type instance } from "../lib";

export type Instance<T> = T extends new (...args: any[]) => infer I ? I : T;

export type Clone<T = any> = {
    [self]: Instance<T>;
    [instance]: {
        clone(): Instance<T>;
    }
};

export const Clone = trait<Clone>({});