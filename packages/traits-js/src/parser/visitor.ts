import { Visitor as OxcVisitor, type Node, type Program } from 'oxc-parser';
import { isDeclaredInModule, type TraitAliasDeclaration } from './node';
import type { FileRegistry } from './storage';

class ModuleDeclaration {
    #visitor: OxcVisitor;

    constructor(ast: Program, visit: (node: Node) => void) {
        const privateDeclarations = getPrivateDeclarations(ast);
        if (privateDeclarations.length) {
            this.#visitor = new OxcVisitor({});
        } else {
            this.#visitor = new OxcVisitor({
                ExportNamedDeclaration: visit,
                ExportDefaultDeclaration: visit,
                ExportAllDeclaration: visit,
            });
        }
    }

    static newVisitor(visit: (node: Node) => void) {
        return new OxcVisitor({
            ExportNamedDeclaration: visit,
            ExportDefaultDeclaration: visit,
            ExportAllDeclaration: visit,
        });
    }


    visit(program: Program) {
        this.#visitor.visit(program);
    }
}


function addDeclaration(
    filePath: string,
    registry: FileRegistry,
    node: Node & { parent: Node },
) {
    const { exportTypes, exportVars, types, vars } = registry;
    if (
        node.type === 'VariableDeclaration'
        && node.kind === 'const'
        && node.declarations[0]?.id.type === 'Identifier'
        && node.declarations[0].id.name in exportVars
    ) {

        const name = node.declarations[0].id.name;
        vars[name] = {
            node,
            start: node.parent.start,
            end: node.parent.end,
            references: [],
        };

    } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
        const name = node.id.name;
        vars[name] = {
            node,
            start: node.parent.start,
            end: node.parent.end,
            references: [],
        };

    } else if (
        node.type === 'TSTypeAliasDeclaration'
        && node.typeAnnotation.type === 'TSTypeLiteral'
    ) {
        const typeDeclarationName = node.id.name;
        if (!(typeDeclarationName in exportTypes)) {
            console.error('trait files must export all type declarations');
            console.log(`${filePath}`);
            console.error(`declared a private type ${typeDeclarationName}\n`);
        } else {
            types[node.id.name] = { node: node as TraitAliasDeclaration, start: node.start, end: node.end, references: [] };
        }
    }


}

function getPrivateDeclarations(ast: Program) {
    return ast.body.filter(node => isDeclaredInModule(node.parent, node))
}

export {
    ModuleDeclaration,
    addDeclaration,
    // visitDeclaration
};

