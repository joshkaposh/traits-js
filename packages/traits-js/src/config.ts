export type TraitConfigExport = {
    cwd?: string;
    traits: string;
    traitFileNameFilter?: string;
    indexFileNameFilter?: string;
};

export type ParsedTraitConfigExport = Required<TraitConfigExport>;

export function defineConfig(config: TraitConfigExport) {
    return config;
}