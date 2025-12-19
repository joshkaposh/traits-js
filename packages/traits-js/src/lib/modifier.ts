import type { DefaultKeysOf } from "./helper-types";

export type instance = typeof instance;
export declare const instance: unique symbol;
export type include = typeof include;
export declare const include: unique symbol;

export type type = typeof type;
export declare const type: unique symbol;


export type self = typeof self;
export declare const self: unique symbol;


export interface ModifierRecord<T = {}> {
    [include]?: Partial<Record<DefaultKeysOf<T>, unknown[]>>;
    [type]?: any[];
};

export type Modifier = keyof ModifierRecord & {};