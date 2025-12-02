export type TraitConfig = {
    traits: string;
    cwd?: string;
    traitFileNameFilter?: string;
    indexFileNameFilter?: string;
};

export function defineConfig(config: TraitConfig) {
    return config;
}