import type { ParseResult } from "oxc-parser";

export type ParseFileResultResult = {
    result: ParseResult;
    path: string;
    directory: string;
    packageJson: string | undefined,
    name: string;
    originalCode: string;
};

export type ParseFileResult = ParseFileResultResult | string[];
