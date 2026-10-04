/**
 * Generates the API reference used by the docs from the library source, so the
 * tables never drift from the code.
 *
 * For every component namespace (packages/svelte-pdf-mini/src/lib/components/<ns>):
 * - `exports.ts` maps part names (Root, Page…) to .svelte files and props types;
 * - `types.ts` is type-checked; a part's own props are the first type argument of
 *   `DivPartProps<Own, Snippet>` (& friends), snippet props the second; interface
 *   props types are read whole;
 * - the .svelte file gives defaults and `$bindable()` props (from the `$props()`
 *   destructuring) and the data attributes it sets.
 *
 * Output: src/lib/api/generated.json
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '../../../packages/svelte-pdf-mini/src/lib');
const componentsDir = join(lib, 'components');
const out = join(here, '../src/lib/api/generated.json');

export interface ApiProp {
	name: string;
	type: string;
	default?: string;
	description?: string;
	required: boolean;
	bindable: boolean;
}
export interface ApiPart {
	name: string;
	/** Full component name, e.g. "Viewer.Page". */
	component: string;
	file: string;
	description?: string;
	/** Element rendered by default (from the HTML attributes the part accepts). */
	element?: string;
	props: ApiProp[];
	snippetProps: ApiProp[];
	dataAttributes: string[];
}
export interface ApiNamespace {
	name: string;
	parts: ApiPart[];
}

// Namespace folder → exported name (see src/lib/index.ts).
const namespaceNames: Record<string, string> = {
	document: 'Document',
	viewer: 'Viewer',
	zoom: 'Zoom',
	'page-nav': 'PageNav',
	find: 'Find',
	outline: 'Outline',
	thumbnails: 'Thumbnails',
	annotations: 'Annotations',
	paper: 'Paper',
	toc: 'Toc',
	minimap: 'Minimap',
	shortcut: 'Shortcut'
};

const PART_WRAPPERS: Record<string, string> = {
	DivPartProps: 'div',
	ButtonPartProps: 'button',
	InputPartProps: 'input',
	FormPartProps: 'form',
	SelectPartProps: 'select'
};

const typesFiles = readdirSync(componentsDir)
	.filter((d) => namespaceNames[d])
	.map((d) => join(componentsDir, d, 'types.ts'));

const program = ts.createProgram(typesFiles, {
	strict: true,
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	skipLibCheck: true,
	allowImportingTsExtensions: true,
	noEmit: true
});
const checker = program.getTypeChecker();

function clean(text: string) {
	return text.replace(/\s+/g, ' ').replace(/import\("[^"]+"\)\./g, '').trim();
}

function docOf(symbol: ts.Symbol) {
	const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
	return text || undefined;
}

/** Properties of a type node, with types written as in the source when possible. */
function propsOfTypeNode(node: ts.TypeNode | undefined): ApiProp[] {
	if (!node) return [];
	const type = checker.getTypeFromTypeNode(node);
	const out: ApiProp[] = [];
	for (const sym of checker.getPropertiesOfType(type)) {
		const decl = sym.valueDeclaration ?? sym.declarations?.[0];
		let typeText: string;
		if (decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) && decl.type) typeText = decl.type.getText();
		else if (decl && ts.isMethodSignature(decl)) typeText = clean(checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, decl)));
		else typeText = clean(checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, node)));
		out.push({
			name: sym.getName(),
			type: clean(typeText),
			description: docOf(sym),
			required: !(sym.flags & ts.SymbolFlags.Optional),
			bindable: false
		});
	}
	return out;
}

/** Resolve an exported props type (alias or interface) to own props, snippet props and element. */
function analyseProps(name: string, file: ts.SourceFile) {
	let own: ApiProp[] = [];
	let snippet: ApiProp[] = [];
	let element: string | undefined;
	let description: string | undefined;
	const visit = (n: ts.Node) => {
		if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === name) {
			const sym = checker.getSymbolAtLocation(n.name);
			if (sym) description = docOf(sym);
			if (ts.isInterfaceDeclaration(n)) {
				const t = checker.getDeclaredTypeOfSymbol(sym!);
				own = checker.getPropertiesOfType(t).map((p) => {
					const d = p.declarations?.[0];
					const tt = d && ts.isPropertySignature(d) && d.type ? d.type.getText() : clean(checker.typeToString(checker.getTypeOfSymbolAtLocation(p, n)));
					return { name: p.getName(), type: clean(tt), description: docOf(p), required: !(p.flags & ts.SymbolFlags.Optional), bindable: false };
				});
				return;
			}
			const t = n.type;
			const ref = ts.isTypeReferenceNode(t) ? t : ts.isIntersectionTypeNode(t) ? t.types.find(ts.isTypeReferenceNode) : undefined;
			const wrapper = ref && ts.isIdentifier(ref.typeName) ? ref.typeName.text : '';
			if (ref && PART_WRAPPERS[wrapper]) {
				element = PART_WRAPPERS[wrapper];
				own = propsOfTypeNode(ref.typeArguments?.[0]);
				snippet = propsOfTypeNode(ref.typeArguments?.[1]);
				// Extra members intersected next to the wrapper (e.g. Omit<…> & { ref?: … }).
				if (ts.isIntersectionTypeNode(t))
					for (const part of t.types) if (part !== ref && ts.isTypeLiteralNode(part)) own.push(...propsOfTypeNode(part));
			} else {
				own = propsOfTypeNode(t);
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(file);
	return { own, snippet, element, description };
}

/** Defaults and bindables from `let { a = 1, b = $bindable(2) } = $props()`. */
function componentInfo(svelteFile: string) {
	const src = readFileSync(svelteFile, 'utf8');
	const defaults: Record<string, string> = {};
	const bindable = new Set<string>();
	const m = src.match(/let\s*\{([\s\S]*?)\}\s*:\s*\w+\s*=\s*\$props\(\)/);
	if (m) {
		let depth = 0;
		let cur = '';
		const entries: string[] = [];
		for (const ch of m[1]) {
			if ('([{'.includes(ch)) depth++;
			if (')]}'.includes(ch)) depth--;
			if (ch === ',' && depth === 0) {
				entries.push(cur);
				cur = '';
			} else cur += ch;
		}
		entries.push(cur);
		for (const raw of entries) {
			const e = raw.trim();
			const eq = e.indexOf('=');
			if (eq < 0 || e.startsWith('...')) continue;
			const key = e.slice(0, eq).split(':')[0].trim();
			let value = e.slice(eq + 1).trim();
			const b = value.match(/^\$bindable\(([\s\S]*)\)$/);
			if (b) {
				bindable.add(key);
				value = b[1].trim();
			}
			if (value) defaults[key] = value.replace(/\s+/g, ' ');
		}
	}
	const attrs = new Set<string>();
	for (const a of src.matchAll(/['"](data-[a-z0-9-]+)['"]\s*:/g)) attrs.add(a[1]);
	for (const a of src.matchAll(/\s(data-[a-z0-9-]+)=/g)) attrs.add(a[1]);
	return { defaults, bindable, dataAttributes: [...attrs].sort() };
}

const COMMON = new Set(['child', 'children', 'ref']);
const namespaces: ApiNamespace[] = [];
for (const [dir, nsName] of Object.entries(namespaceNames)) {
	const folder = join(componentsDir, dir);
	const exportsSrc = readFileSync(join(folder, 'exports.ts'), 'utf8');
	const typesFile = program.getSourceFile(join(folder, 'types.ts'));
	if (!typesFile) continue;
	const partFiles = new Map<string, string>();
	for (const m of exportsSrc.matchAll(/export \{ default as (\w+) \} from '\.\/([\w-]+\.svelte)'/g)) partFiles.set(m[1], m[2]);
	const partTypes = new Map<string, string>();
	for (const m of exportsSrc.matchAll(/(\w+) as (\w+)Props/g)) partTypes.set(m[2], m[1]);
	const parts: ApiPart[] = [];
	for (const [part, file] of partFiles) {
		const typeName = partTypes.get(part);
		const { own, snippet, element, description } = typeName ? analyseProps(typeName, typesFile) : { own: [], snippet: [], element: undefined, description: undefined };
		const info = componentInfo(join(folder, file));
		const props = own
			.filter((p) => !COMMON.has(p.name))
			.map((p) => ({ ...p, default: info.defaults[p.name], bindable: info.bindable.has(p.name) }));
		// Every part also takes ref / child / children (documented once per page).
		parts.push({
			name: part,
			component: `${nsName}.${part}`,
			file: `components/${dir}/${file}`,
			description,
			element,
			props,
			snippetProps: snippet,
			dataAttributes: info.dataAttributes
		});
	}
	namespaces.push({ name: nsName, parts });
}

// CSS variables read by the optional stylesheet, with their fallback values.
const css = readFileSync(join(lib, 'styles.css'), 'utf8');
const cssVars = new Map<string, string | undefined>();
for (const m of css.matchAll(/var\((--pdf-[a-z0-9-]+)\s*(?:,\s*((?:[^()]|\([^()]*(?:\([^()]*\)[^()]*)*\))*?))?\)/g)) {
	const [, name, fallback] = m;
	if (!cssVars.has(name) || (!cssVars.get(name) && fallback)) cssVars.set(name, fallback?.trim().replace(/\s+/g, ' '));
}
for (const m of css.matchAll(/(--pdf-[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!cssVars.get(m[1])) cssVars.set(m[1], m[2].trim());
const cssVariables = [...cssVars].map(([name, fallback]) => ({ name, default: fallback })).sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), namespaces, cssVariables }, null, '\t') + '\n');
const count = namespaces.reduce((n, ns) => n + ns.parts.length, 0);
console.log(`api: ${namespaces.length} namespaces, ${count} parts, ${cssVariables.length} CSS variables`);
